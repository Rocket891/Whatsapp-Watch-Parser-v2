import os
import re
import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog, messagebox
import json
from datetime import datetime
from pathlib import Path
import pandas as pd
import threading
import webbrowser
import traceback

# === CONFIGURATION ===
BASE_DIR = Path(__file__).parent
DEFAULT_CHATS_DIR = BASE_DIR / "Whatsapp Chats"
DEFAULT_OUTPUT_DIR = BASE_DIR / "Outputs-Extracted ID"
CONFIG_FILE = BASE_DIR / "extractor_config.json"
DEFAULT_OUTPUT_DIR.mkdir(exist_ok=True)
DEFAULT_REF_FILE = r"I:\OneDrive - RocketLab\WORK\Watches\nishant watch work\Whatsapp Watch Extract\database\Referance ID Merged\WatchRef_Merged_17May2025_17-16.xlsx"

HEADER_RE = re.compile(
    r'^\[([\d/]+),\s*'
    r'(\d{1,2}:\d{2}(?::\d{2})?\s*[APMapm]{2})\]\s*'
    r'([^:]+?):\s*'
    r'(.*)$'
)

def parse_price(text):
    t = text.replace(',', '').lower()
    if m := re.search(r'(\d+\.\d+)\s*k', t): return int(float(m.group(1)) * 1000)
    if m := re.search(r'(\d+\.\d+)\s*m', t): return int(float(m.group(1)) * 1000000)
    if m := re.search(r'(\d+)\s*k\b', t): return int(int(m.group(1)) * 1000)
    if m := re.search(r'(\d+)\s*m\b', t): return int(int(m.group(1)) * 1000000)
    if m := re.search(r'(\d+\.\d+)\s*mill', t): return int(float(m.group(1)) * 1000000)
    if m := re.search(r'(?:hkd|usd|eur|chf|usdt)[: ]\s*(\d{5,})', t): return int(m.group(1))
    if m := re.search(r'(?:hkd|usd|eur|chf|usdt)(\d{5,})', t): return int(m.group(1))
    if m := re.search(r'\b(\d{6,})\b', t): return int(m.group(1))
    return 0

def parse_currency(text):
    t = text.lower()
    if 'usdt' in t: return 'USDT'
    if 'usd' in t or '$' in t: return 'USD'
    if 'eur' in t or '€' in t: return 'EUR'
    if 'chf' in t: return 'CHF'
    if 'gbp' in t or '£' in t: return 'GBP'
    return 'HKD'

def parse_year(text):
    if m := re.search(r'\b(20\d{2})\b', text): return m.group(1)
    if m := re.search(r'(20\d{2})/\d{2}', text): return m.group(1)
    if m := re.search(r'\b(\d{1,2})(?:y|Y)\b', text, re.IGNORECASE):
        year_val = int(m.group(1))
        return f"20{year_val:02d}" if year_val < 50 else f"19{year_val:02d}"
    if m := re.search(r'(20\d{2})(?:year|yr)', text, re.IGNORECASE): return m.group(1)
    return ""

def parse_variant(text):
    t = text.upper()
    for v in ('BLUE', 'BLACK', 'GREEN', 'WHITE', 'RED', 'GREY', 'GRAY', 'JUB', 'OYS', 'RG', 'TI', 'WG'):
        if re.search(rf'\b{v}\b', t): return 'GREY' if v == 'GRAY' else v
    return ""

def parse_condition(text):
    t = text.lower()
    if 'like new' in t: return 'Like New'
    if 'used' in t: return 'Used'
    if 'full set' in t or 'fullset' in t: return 'Full Set'
    if 'mint' in t: return 'Mint'
    if 'new' in t: return 'New'
    if 'only watch' in t: return 'Only Watch'
    return ""

def split_segments(body, pid):
    segs = []
    for line in body.splitlines():
        parts = [p.strip() for p in line.split("//")]
        for p in parts:
            if re.search(rf'\b{re.escape(pid)}\b', p, re.IGNORECASE):
                segs.append(p)
    return segs

def attach_following(body, pid):
    lines = [l.strip() for l in body.splitlines() if l.strip()]
    results = []
    for i, line in enumerate(lines):
        if re.search(rf'\b{re.escape(pid)}\b', line, re.IGNORECASE):
            if parse_price(line) > 0 or parse_year(line): continue
            for j in range(i+1, min(i+6, len(lines))):
                if j >= len(lines): break
                follow_line = lines[j]
                if re.search(r'\b[A-Z0-9]{4,}/[A-Z0-9\-]+\b', follow_line, re.IGNORECASE) and not re.search(rf'\b{re.escape(pid)}\b', follow_line, re.IGNORECASE): break
                if parse_year(follow_line) or parse_price(follow_line) > 0:
                    results.append(f"{line} // {follow_line}")
    return results

def extract_message_entries(body, pid):
    entries = []
    entries += split_segments(body, pid)
    entries += attach_following(body, pid)
    seen = set()
    final = []
    for e in entries:
        if e not in seen:
            seen.add(e)
            final.append(e)
    return final

def process_chat_file(path, pid, logger=None):
    rows = []
    chat_name = path.stem
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            content = f.read()
        msgs = []
        curr = None
        for line in content.splitlines():
            h = HEADER_RE.match(line)
            if h:
                if curr: msgs.append(curr)
                curr = {'date': h.group(1), 'time': h.group(2), 'sender': h.group(3), 'body': h.group(4)}
            else:
                if curr: curr['body'] += '\n' + line
        if curr: msgs.append(curr)
        if logger: logger(f"Processing {chat_name}... ({len(msgs)} messages)")
        matches_found = 0
        for m in msgs:
            if pid.lower() not in m['body'].lower():
                continue
            raws = extract_message_entries(m['body'], pid)
            for raw in raws:
                if re.search(r'PHOTO|omitted|attached:', raw, re.IGNORECASE):
                    continue
                year = parse_year(raw)
                variant = parse_variant(raw)
                cond = parse_condition(raw)
                price = parse_price(raw)
                currency = parse_currency(raw)
                rows.append({
                    "Chat": chat_name,
                    "Date": m['date'],
                    "Time": m['time'],
                    "Sender": m['sender'],
                    "PID": pid.upper(),
                    "Year": year,
                    "Variant": variant,
                    "Condition": cond,
                    "Price": price,
                    "Currency": currency,
                    "Raw Line": raw,
                    "Remark": ""
                })
                matches_found += 1
        if logger: logger(f"  - Found {matches_found} matches in {chat_name}")
    except Exception as e:
        if logger: logger(f"Error processing {path}: {e}")
        if logger: logger(traceback.format_exc())
    return rows

class WatchExtractorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("WhatsApp Watch Data Extractor")
        self.root.geometry("950x600")
        self.config = self.load_config()
        self.pid_var = tk.StringVar()
        self.ref_file_var = tk.StringVar(value=self.config["ref_file"])
        self.chats_dir_var = tk.StringVar(value=self.config["chats_dir"])
        self.output_dir_var = tk.StringVar(value=self.config["output_dir"])
        self.use_default_chats_var = tk.BooleanVar(value=self.config["use_default_chats"])
        self.use_default_ref_var = tk.BooleanVar(value=self.config["use_default_ref"])
        self.use_default_output_var = tk.BooleanVar(value=self.config["use_default_output"])
        self.reference_optional_var = tk.BooleanVar(value=self.config.get("reference_optional", True))
        self.progress_var = tk.DoubleVar(value=0)
        self.watch_info = {"brand": "", "family": "", "url": ""}
        self.create_widgets()

    def load_config(self):
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {
            "ref_file": DEFAULT_REF_FILE,
            "chats_dir": str(DEFAULT_CHATS_DIR),
            "output_dir": str(DEFAULT_OUTPUT_DIR),
            "use_default_chats": True,
            "use_default_ref": True,
            "use_default_output": True,
            "reference_optional": True
        }

    def save_config(self):
        self.config["ref_file"] = self.ref_file_var.get()
        self.config["chats_dir"] = self.chats_dir_var.get()
        self.config["output_dir"] = self.output_dir_var.get()
        self.config["use_default_chats"] = self.use_default_chats_var.get()
        self.config["use_default_ref"] = self.use_default_ref_var.get()
        self.config["use_default_output"] = self.use_default_output_var.get()
        self.config["reference_optional"] = self.reference_optional_var.get()
        with open(CONFIG_FILE, 'w') as f:
            json.dump(self.config, f)

    def create_widgets(self):
        main_frame = ttk.Frame(self.root, padding=8)
        main_frame.pack(fill=tk.BOTH, expand=True)
        ttk.Label(main_frame, text="WhatsApp Watch Data Extractor", font=("Segoe UI", 16, "bold")).pack(pady=(0, 8))
        input_frame = ttk.LabelFrame(main_frame, text="Input Settings")
        input_frame.pack(fill=tk.X, padx=2, pady=2)
        row = 0
        ttk.Label(input_frame, text="Product ID:").grid(row=row, column=0, sticky=tk.W, padx=5, pady=3)
        pid_entry = ttk.Entry(input_frame, textvariable=self.pid_var, width=32)
        pid_entry.grid(row=row, column=1, sticky=tk.W, padx=5, pady=3)
        ttk.Button(input_frame, text="Lookup", command=self.lookup_watch_info).grid(row=row, column=2, padx=5, pady=3)
        row += 1
        ttk.Label(input_frame, text="Chat Folder:").grid(row=row, column=0, sticky=tk.W, padx=5, pady=3)
        ttk.Entry(input_frame, textvariable=self.chats_dir_var, width=45).grid(row=row, column=1, padx=5, pady=3)
        ttk.Button(input_frame, text="Browse...", command=self.browse_chats).grid(row=row, column=2, padx=5, pady=3)
        ttk.Checkbutton(input_frame, text="Remember as default", variable=self.use_default_chats_var, command=self.save_config).grid(row=row, column=3, padx=5, pady=3)
        row += 1
        ttk.Checkbutton(input_frame, text="Use Reference File (Optional)", variable=self.reference_optional_var, command=self.save_config).grid(row=row, column=0, padx=5, pady=3)
        ttk.Entry(input_frame, textvariable=self.ref_file_var, width=45).grid(row=row, column=1, padx=5, pady=3)
        ttk.Button(input_frame, text="Browse...", command=self.browse_ref).grid(row=row, column=2, padx=5, pady=3)
        ttk.Checkbutton(input_frame, text="Remember", variable=self.use_default_ref_var, command=self.save_config).grid(row=row, column=3, padx=5, pady=3)
        row += 1
        ttk.Label(input_frame, text="Output Folder:").grid(row=row, column=0, sticky=tk.W, padx=5, pady=3)
        ttk.Entry(input_frame, textvariable=self.output_dir_var, width=45).grid(row=row, column=1, padx=5, pady=3)
        ttk.Button(input_frame, text="Browse...", command=self.browse_output).grid(row=row, column=2, padx=5, pady=3)
        ttk.Checkbutton(input_frame, text="Remember", variable=self.use_default_output_var, command=self.save_config).grid(row=row, column=3, padx=5, pady=3)
        info_frame = ttk.LabelFrame(main_frame, text="Watch Information", padding=(10, 5))
        info_frame.pack(fill=tk.X, padx=2, pady=(4, 2))
        self.info_label = ttk.Label(info_frame, text="Brand: | Family: ", font=("Segoe UI", 12, "bold"), foreground="#1a237e")
        self.info_label.pack(anchor=tk.W, pady=(2, 0))
        self.url_label = ttk.Label(info_frame, text="", font=("Segoe UI", 10, "underline"), foreground="#1565c0", cursor="hand2")
        self.url_label.pack(anchor=tk.W)
        self.url_label.bind("<Button-1>", self.open_url)
        run_frame = ttk.Frame(main_frame)
        run_frame.pack(fill=tk.X, padx=2, pady=(4, 2))
        self.extract_btn = ttk.Button(run_frame, text="Run Extraction", command=self.start_extraction, width=18)
        self.extract_btn.pack(side=tk.LEFT, padx=5)
        self.progress_bar = ttk.Progressbar(run_frame, orient="horizontal", length=700, mode="determinate", variable=self.progress_var)
        self.progress_bar.pack(side=tk.LEFT, padx=10, fill=tk.X, expand=True)
        log_frame = ttk.Frame(main_frame)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=2, pady=(2, 8))
        self.log_text = scrolledtext.ScrolledText(log_frame, wrap=tk.WORD, height=16, font=("Consolas", 10))
        self.log_text.pack(fill=tk.BOTH, expand=True)

    def log(self, msg):
        self.log_text.insert(tk.END, msg + "\n")
        self.log_text.see(tk.END)
        self.root.update_idletasks()

    def browse_chats(self):
        path = filedialog.askdirectory(title="Select WhatsApp Chats Folder", initialdir=self.chats_dir_var.get())
        if path: self.chats_dir_var.set(path)

    def browse_ref(self):
        path = filedialog.askopenfilename(title="Select Reference File", filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")], initialdir=os.path.dirname(self.ref_file_var.get()))
        if path: self.ref_file_var.set(path)

    def browse_output(self):
        path = filedialog.askdirectory(title="Select Output Folder", initialdir=self.output_dir_var.get())
        if path: self.output_dir_var.set(path)

    def lookup_watch_info(self):
        pid = self.pid_var.get().strip()
        if not pid or not self.reference_optional_var.get():
            self.info_label.config(text="Brand: | Family: ")
            self.url_label.config(text="")
            self.watch_info = {"brand": "", "family": "", "url": ""}
            return
        ref_file = self.ref_file_var.get()
        if not os.path.exists(ref_file):
            self.log(f"Reference file not found: {ref_file}")
            self.info_label.config(text="Brand: | Family: ")
            self.url_label.config(text="")
            self.watch_info = {"brand": "", "family": "", "url": ""}
            return
        self.log(f"Looking up information for {pid}...")
        try:
            df = pd.read_excel(ref_file, engine='openpyxl')
            found = False
            for col in df.columns:
                matches = df[df[col].astype(str).str.contains(pid, case=False, na=False)]
                if not matches.empty:
                    row = matches.iloc[0]
                    brand_col = next((c for c in df.columns if 'brand' in str(c).lower()), None)
                    family_col = next((c for c in df.columns if any(x in str(c).lower() for x in ['family', 'collection', 'model'])), None)
                    url_col = next((c for c in df.columns if 'url' in str(c).lower() or 'link' in str(c).lower()), None)
                    brand = str(row[brand_col]) if brand_col and not pd.isna(row[brand_col]) else ""
                    family = str(row[family_col]) if family_col and not pd.isna(row[family_col]) else ""
                    url = str(row[url_col]) if url_col and not pd.isna(row[url_col]) else ""
                    self.watch_info = {"brand": brand, "family": family, "url": url}
                    self.info_label.config(text=f"Brand: {brand} | Family: {family}")
                    self.url_label.config(text=url)
                    found = True
                    self.log(f"Found watch info: {brand} | {family} | {url}")
                    break
            if not found:
                self.info_label.config(text="Brand: | Family: ")
                self.url_label.config(text="")
                self.watch_info = {"brand": "", "family": "", "url": ""}
                self.log(f"No reference information found for {pid}")
        except Exception as e:
            self.log(f"Error reading reference file: {e}")

    def open_url(self, event):
        url = self.watch_info["url"]
        if url and url != "nan":
            webbrowser.open(url)

    def start_extraction(self):
        pid = self.pid_var.get().strip()
        if not pid:
            messagebox.showwarning("Input Required", "Please enter a Product ID")
            return
        self.log_text.delete(1.0, tk.END)
        self.progress_var.set(0)
        self.lookup_watch_info()
        chats_dir = Path(self.chats_dir_var.get())
        output_dir = Path(self.output_dir_var.get())
        thread = threading.Thread(target=self.extraction_thread, args=(pid, chats_dir, output_dir))
        thread.daemon = True
        thread.start()

    def extraction_thread(self, pid, chats_dir, output_dir):
        try:
            self.log(f"Starting extraction for {pid}")
            txt_files = list(chats_dir.glob("*.txt"))
            if not txt_files:
                self.log(f"No .txt files found in {chats_dir}")
                return
            self.log(f"Found {len(txt_files)} chat files")
            all_entries = []
            for i, txt_file in enumerate(txt_files):
                progress = int((i / len(txt_files)) * 100)
                self.progress_var.set(progress)
                self.log(f"→ {txt_file.name}")
                entries = process_chat_file(txt_file, pid, self.log)
                self.log(f"  {len(entries)} matches")
                all_entries.extend(entries)
            if not all_entries:
                self.log(f"No matches found for {pid}")
                return
            df = pd.DataFrame(all_entries)
            if "Year" in df.columns:
                df["Year"] = df["Year"].astype(str).replace(r'\.0$', '', regex=True)
                df["Year"] = df["Year"].replace('nan', '')
            df.insert(0, "Series", range(1, len(df) + 1))
            output_dir.mkdir(exist_ok=True)
            safe_pid = pid.replace('/', '_').replace('\\', '_')
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = output_dir / f"{safe_pid}_{timestamp}.xlsx"
            self.progress_var.set(90)
            self.log("Saving Excel file...")
            with pd.ExcelWriter(output_path, engine="xlsxwriter") as writer:
                workbook = writer.book
                worksheet = workbook.add_worksheet("Data")
                header_format = workbook.add_format({
                    "bold": True,
                    "bg_color": "yellow",
                    "align": "center",
                    "valign": "vcenter",
                    "border": 1
                })
                worksheet.merge_range('A1:B1', self.watch_info["brand"], header_format)
                worksheet.merge_range('C1:D1', self.watch_info["family"], header_format)
                worksheet.merge_range('E1:K1', self.watch_info["url"], header_format)
                start_row = 1
                col_header_format = workbook.add_format({"bold": True, "bg_color": "#D9E1F2"})
                for col_num, value in enumerate(df.columns):
                    worksheet.write(start_row, col_num, value, col_header_format)
                alt_format = workbook.add_format({"bg_color": "#f5f5f5"})
                for row_idx, row in df.iterrows():
                    for col_idx, value in enumerate(row):
                        worksheet.write(start_row + 1 + row_idx, col_idx, value)
                    if row_idx % 2 == 1:
                        worksheet.set_row(start_row + 1 + row_idx, cell_format=alt_format)
                for i, col in enumerate(df.columns):
                    max_width = max(
                        df[col].astype(str).map(len).max(),
                        len(str(col))
                    ) + 2
                    worksheet.set_column(i, i, min(max_width, 50))
                worksheet.freeze_panes(start_row + 1, 0)
            self.progress_var.set(100)
            self.log(f"✅ Saved {len(df)} records to: {output_path}")
            try:
                os.startfile(output_path)
            except Exception:
                pass
        except Exception as e:
            self.log(f"Error during extraction: {str(e)}")
            self.log(traceback.format_exc())
        self.extract_btn.config(state=tk.NORMAL)

def main():
    root = tk.Tk()
    app = WatchExtractorApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
