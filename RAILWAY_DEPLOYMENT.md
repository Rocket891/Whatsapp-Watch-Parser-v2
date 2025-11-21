# 🚂 Railway Deployment Guide - Baby Steps

## Why Railway?
- **Different IP addresses** from Replit (not blocked by mBlaster yet!)
- **Static IP option** to prevent future blocking
- **Production-ready** hosting

---

## STEP 1: Create Railway Account

1. Go to: https://railway.app
2. Click **"Login"**
3. Choose **"Login with GitHub"** (easiest option)
4. Authorize Railway to access GitHub

---

## STEP 2: Push Your Code to GitHub

### Option A: Using Replit's Git Integration
1. In Replit, click the **Version Control** icon (left sidebar)
2. Click **"Create a Git repository"**
3. Commit all files: Enter message "Initial commit for Railway"
4. Click **"Connect to GitHub"**
5. Follow prompts to push to GitHub

### Option B: Manual Push (if Option A doesn't work)
```bash
# In Replit Shell:
git init
git add .
git commit -m "Initial commit for Railway"

# Create new repo on GitHub (github.com/new)
# Then run:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

---

## STEP 3: Deploy to Railway

1. Go to Railway dashboard: https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository
5. Railway will auto-detect Node.js and start building
6. Wait 2-3 minutes for initial deployment

---

## STEP 4: Add Environment Variables

1. In Railway dashboard, click your deployed service
2. Click **"Variables"** tab
3. Add these variables one by one:

**REQUIRED:**
```
DATABASE_URL=<your_postgres_connection_string>
NODE_ENV=production
SESSION_SECRET=<random_secret_key>
```

**OPTIONAL (if you use them):**
```
STRIPE_SECRET_KEY=<your_stripe_key>
VITE_STRIPE_PUBLIC_KEY=<your_public_key>
```

**How to get DATABASE_URL from Replit:**
- In Replit, go to Tools → Secrets
- Copy the `DATABASE_URL` value
- Paste it into Railway

4. Click **"Redeploy"** after adding variables

---

## STEP 5: Enable Static IP (IMPORTANT!)

1. Click your service → **"Settings"** tab
2. Scroll down to **"Networking"** section
3. Toggle **"Enable Static Outbound IPs"**
4. You'll see an IP address (e.g., `35.123.456.789`)
5. **Copy this IP** - you'll need it for mBlaster
6. Click **"Redeploy"** again

---

## STEP 6: Get Your Railway App URL

1. In your service, click the **"Settings"** tab
2. Under **"Domains"**, you'll see a URL like:
   ```
   your-app-production-xyz.up.railway.app
   ```
3. Copy this URL

---

## STEP 7: Update mBlaster Webhook

1. Login to mBlaster dashboard: https://mblaster.in
2. Go to **Webhook Settings**
3. **Change webhook URL to:**
   ```
   https://your-app-production-xyz.up.railway.app/webhook-secure
   ```
4. Save changes

---

## STEP 8: Test It!

1. Send a test message in your WhatsApp group
2. Check Railway logs:
   - Go to your service → **"Deployments"** tab
   - Click latest deployment → View logs
   - Look for: `✅ Successfully saved X listings`

3. Check your app dashboard:
   - Visit: `https://your-app-production-xyz.up.railway.app`
   - Login with your credentials
   - Check if new messages appear

---

## Troubleshooting

### "Build failed"
- Check Railway logs for errors
- Make sure all dependencies are in `package.json`
- Try redeploying

### "App crashes on start"
- Check if all environment variables are set
- Verify `DATABASE_URL` is correct
- Check Railway logs for error messages

### "Still no messages"
- Verify mBlaster webhook URL is updated
- Check Railway static IP is enabled
- Wait 5-10 minutes (mBlaster may cache old webhook)

---

## Cost

- **Railway Pro Plan**: $20/month (required for static IP)
- Includes: Static IP, better resources, no usage limits

---

## Next Steps After Success

1. ✅ Messages flowing? Great!
2. Set up custom domain (optional)
3. Monitor Railway logs regularly
4. Keep Replit as backup/development

---

Need help? Check Railway docs: https://docs.railway.app
