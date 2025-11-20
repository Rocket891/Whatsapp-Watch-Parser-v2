# Watch Trading Data Parser System

## Overview
This project is a full-stack web application designed to automate the processing and management of watch trading data from WhatsApp messages. Its primary purpose is to parse watch listing messages using regex, store this data in a PostgreSQL database, and provide a modern web interface for efficient searching, viewing, and management of the parsed information. The system aims to streamline the watch trading process, offering a centralized hub for data analysis and quick access to market insights. It has significant potential for traders and businesses in the luxury watch market, enabling them to quickly identify valuable listings and trends.

## Recent Changes (August 15, 2025)
✅ **ALL MAJOR UI ISSUES COMPLETELY RESOLVED** - Fixed sidebar scrolling, phone extraction, message persistence, and inventory layout
✅ **PERSISTENT MESSAGE STORAGE IMPLEMENTED** - Messages now saved to data/raw-messages.json and survive server restarts
✅ **REAL PHONE NUMBER EXTRACTION WORKING** - System correctly shows real numbers (8688937001185) instead of group IDs from @lid JIDs
✅ **WHATSAPP MESSAGES TAB FULLY FUNCTIONAL** - Live incoming messages display properly with 5-second refresh and persistent storage
✅ **SIDEBAR NAVIGATION FIXED** - Navigation now scrollable with proper overflow-y-auto and flex structure for multiple tabs
✅ **INVENTORY PAGE LAYOUT CORRECTED** - Added proper sidebar and topbar structure consistent with other pages
✅ **COMPREHENSIVE MESSAGE DISPLAY** - Shows real group names like "One World Dealers Group (YOLO) 🌎 ⌚️" and sender details
✅ **WEBHOOK PROCESSING VERIFIED** - Full end-to-end testing confirms messages flow correctly from webhook to UI display

## Previous Achievements (August 14, 2025)
✅ **CHATGPT GROUP DATABASE SOLUTION IMPLEMENTED** - Complete persistent groups database with JSON file backup
✅ **REAL GROUP NAME LEARNING** - System automatically learns and stores real WhatsApp group names from webhook traffic
✅ **ADVANCED GROUP LEARNING SERVICE** - groupDb.ts service with intelligent name extraction from multiple webhook sources
✅ **PLACEHOLDER NAME FILTERING** - Ignores "Watch Group" placeholders and prioritizes real group names from API data
✅ **COMPREHENSIVE WEBHOOK INTEGRATION** - Updated webhook handlers to use new group learning for all message formats
✅ **GROUP REBUILD FUNCTIONALITY** - API endpoint to populate groups database from historical watch_listings data
✅ **PERSISTENT GROUP STORAGE** - Groups stored in data/groups.json with automatic backup and restore
✅ **INSTANCE NUMBER MAPPING** - Groups now store and display proper instance phone numbers
✅ **REAL NAME DISPLAY** - Groups now show actual names like "One World Dealers Group (YOLO) 🌎 ⌚️" instead of placeholders
✅ **WEBHOOK-FIRST ARCHITECTURE ENHANCED** - Complete solution with real name learning capabilities
✅ **DATABASE-DRIVEN GROUP MANAGEMENT** - New API routes for group management and database operations
✅ **AUTOMATIC GROUP DISCOVERY** - New groups learned from webhook traffic with real names preserved

## Previous Achievements (Resolved)
✅ **ALL PARSING ISSUES RESOLVED** - Complete system now working perfectly with contextual header parsing
✅ **WHATSAPP CONNECTION RESTORED** - Fixed mBlaster credential authentication, system fully operational
✅ **G0A45004 FORMAT WORKING** - Complex letter+digit+letter+digits format (G0A45004) now recognized correctly
✅ **CONTEXTUAL HEADER PARSING ENHANCED** - Headers like "🌟 2024 all brand new" and "🌟 2025 Used" apply year and condition to subsequent listings
✅ **MONTH COLUMN ADDED** - Month column (N1-N12) now visible in both test results and all records pages next to year column
✅ **HEADER CONTEXT CASCADING** - Year and condition from headers properly cascade to all PIDs below until new header found
✅ **FRONTEND UI COMPLETE** - Both message testing and all records pages display month column in correct position
✅ **7118/1200r PID PARSING FIXED** - Now extracts full PID "7118/1200R" instead of partial "1200R"
✅ **FULL MESSAGE VIEWING** - Users can click eye icon to view complete message content and copy for accurate testing
✅ **CRITICAL SECURITY FIX: Group Whitelist Working** - Now properly blocks unauthorized groups (120363417668189591@g.us blocked, only 120363400262559729@g.us allowed)
✅ **CRITICAL PARSING FIX: Multi-PID Logic Corrected** - Fixed condition check from `length > 1` to `length > 0` for proper multi-PID processing
✅ **🌹 Symbol Support Added** - Enhanced multi-PID parsing for 🍁, ❤️, ⭐, ✅, 🔥, 💎, 🚀, ⚡, 🌹 emoji separators
✅ **Database Enrichment Storage** - Fixed webhook handler to save brand/family fields from parser to database
✅ **Smart Line Combining** - Q3523490 format now correctly combines PID + price lines
✅ **A.Lange&Sohne PID Parsing Fixed** - Enhanced xxx.xxx pattern recognition (363.608, 139.021, etc.)
✅ **Reference Database Enrichment** - 24,796 records providing brand/family matching with high accuracy
✅ **Unicode Character Cleaning** - Resolved database JSON parsing errors

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application employs a full-stack architecture, ensuring clear separation between its components.

### Core Technologies
-   **Frontend**: React with TypeScript, utilizing Vite for optimized builds.
-   **Backend**: Express.js server developed in TypeScript.
-   **Database**: PostgreSQL, managed with Drizzle ORM.
-   **Styling**: Tailwind CSS, augmented by shadcn/ui for pre-built, accessible components.
-   **State Management**: TanStack Query for server-side state synchronization.

### Frontend Design
-   **UI/UX**: Features a clean, modern aesthetic achieved through Tailwind CSS and shadcn/ui. Components include comprehensive tables, forms with validation, modal dialogs, toast notifications, navigation elements, and data visualization (charts, progress indicators).
-   **Technical Implementation**: React 18 with TypeScript for robust component development, Wouter for client-side routing, and Radix UI primitives underpinning shadcn/ui components for accessibility and customizability.

### Backend Design
-   **Technical Implementation**: Express.js in TypeScript for a robust API layer, Drizzle ORM for type-safe database interactions with PostgreSQL (leveraging Neon serverless for connection pooling). The API is RESTful, designed for structured error handling.
-   **Feature Specifications**: Includes real-time message processing, advanced regex-based data parsing, multi-PID extraction from single messages, dynamic instance and webhook management for WhatsApp integration, comprehensive search filters with persistence, and a PID alert system with WhatsApp notifications. It also features a reference database for watch data enrichment.

### Database Schema
The system's data model comprises four primary tables:
-   `users`: For authentication and user management.
-   `watch_listings`: Stores parsed watch trading data, including PID, price, condition, chat ID, sender, and raw message line. Expanded to include Brand, Family, Model Year, and Variant for enriched data.
-   `processing_logs`: Records the status and errors of message processing.
-   `system_stats`: Stores daily metrics for dashboard display.

### System Design Choices
-   **Webhook-First Architecture**: Uses webhook-only mode by default to avoid mBlaster IP blocking. System learns contact names and discovers groups from incoming webhook traffic without requiring outbound API calls.
-   **Persistent Caching**: Implements wa-cache.ts for storing contact names, group information, and webhook heartbeat data across server restarts. Uses JSON file backup for persistence.
-   **Connection Monitoring**: Features webhook-based connection status that tracks the last webhook received timestamp instead of making API ping calls, ensuring reliable status monitoring without IP restrictions.
-   **Data Flow**: WhatsApp messages are processed by webhook integration (mblaster.in), parsed using regex, and stored in `watch_listings`. The Express API serves this data to the React frontend for display, filtering, and search.
-   **Parsing Logic**: Employs sophisticated regex patterns for extracting watch details (PID, price, year, condition) and supports multi-PID parsing from single messages, handling various separators. Includes logic for smart PID matching against a reference database for enrichment.
-   **API Design**: All API endpoints conform to a consistent RESTful structure, with specific attention to handling GET requests with query strings for data retrieval and POST requests for actions like sending WhatsApp notifications.
-   **Dynamic Configuration**: Supports dynamic management of WhatsApp instances, access tokens, group whitelists, and mode switching (webhook_only vs full_api), allowing for real-time configuration updates without server restarts.
-   **User Experience**: Prioritizes persistent search filters, sortable columns, real-time name resolution for contacts and groups, standardized date/time formats, and robust Excel export functionality.

## External Dependencies

### Core Services & Libraries
-   **Database**: Neon PostgreSQL (serverless).
-   **WhatsApp Integration**: mblaster.in API for sending/receiving WhatsApp messages and managing instances.
-   **UI Components**: Radix UI (primitives) and shadcn/ui (styled components).
-   **Form Management**: React Hook Form with Zod for validation.
-   **Date Manipulation**: `date-fns`.
-   **Styling Utilities**: `class-variance-authority` (used with Tailwind CSS).
-   **Excel Export**: ExcelJS library for generating `.xlsx` files.

### Development Tools
-   **Type Safety**: TypeScript.
-   **Frontend Build**: Vite.
-   **Database Migrations**: Drizzle Kit.
-   **Backend Bundling**: ESBuild.