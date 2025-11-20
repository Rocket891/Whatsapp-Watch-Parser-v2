# Watch Trading Data Parser System

## Overview
This project is a full-stack web application designed to automate the processing and management of watch trading data from WhatsApp messages. Its primary purpose is to parse watch listing messages using regex, store this data in a PostgreSQL database, and provide a modern web interface for efficient searching, viewing, and management of the parsed information. The system aims to streamline the watch trading process, offering a centralized hub for data analysis and quick access to market insights. It has significant potential for traders and businesses in the luxury watch market, enabling them to quickly identify valuable listings and trends.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Critical Fixes (November 5, 2025)

### Webhook Processing Bug (RESOLVED)
**Issue**: Watch listings parsed from WhatsApp messages were not being saved to database after Sept 11, 2025.
**Root Cause**: Field name mismatch - webhook processor used `groupId` instead of `chatId` when creating listings.
**Impact**: Approximately 217,623 messages were successfully parsed but failed to create watch listings.
**Fix**: Changed field name from `groupId` to `chatId` in webhook-secure.ts (line 456).
**Status**: ✅ Deployed - all new incoming messages will now correctly save watch listings.

### Known Issues

#### mBlaster IP Blocking
**Symptom**: WhatsApp connection status shows "disconnected" in UI.
**Reality**: Webhooks continue to function normally - messages are received and processed.
**Root Cause**: mBlaster's IP blocking prevents connection status check API calls from succeeding.
**Workaround**: Implemented exponential backoff retry logic (2s, 3s, 4s delays with 3 retry attempts).
**Impact**: Cosmetic only - does not affect message processing or data integrity.
**Note**: The system uses webhook health as authoritative connection status.

## System Architecture
The application employs a full-stack architecture, ensuring clear separation between its components.

### Core Technologies
-   **Frontend**: React with TypeScript, utilizing Vite for optimized builds.
-   **Backend**: Express.js server developed in TypeScript.
-   **Database**: PostgreSQL, managed with Drizzle ORM.
-   **Styling**: Tailwind CSS, augmented by shadcn/ui for pre-built, accessible components.
-   **State Management**: TanStack Query for server-side state synchronization.

### Frontend Design
-   **UI/UX**: Features a clean, modern aesthetic achieved through Tailwind CSS and shadcn/ui. Components include comprehensive tables, forms with validation, modal dialogs, toast notifications, navigation elements, and data visualization. Includes a comprehensive theme system with 10 professional themes.
-   **Technical Implementation**: React 18 with TypeScript for robust component development, Wouter for client-side routing, and Radix UI primitives underpinning shadcn/ui components for accessibility and customizability.

### Backend Design
-   **Technical Implementation**: Express.js in TypeScript for a robust API layer, Drizzle ORM for type-safe database interactions with PostgreSQL. The API is RESTful, designed for structured error handling.
-   **Feature Specifications**: Includes real-time message processing with advanced normalization, sophisticated regex-based data parsing, multi-PID extraction, intelligent deduplication, proper sender number handling, dynamic instance and webhook management for WhatsApp integration, comprehensive search filters with persistence, enhanced media handling, advanced offer parsing, and a PID alert system with WhatsApp notifications. It also features a reference database for watch data enrichment. Implements a revolutionary requirement matching system for watch trading with an intelligent scoring algorithm. Includes a comprehensive group broadcast system with options for sending privately to contacts in groups or directly to groups.

### Database Schema
The system's data model comprises five primary tables:
-   `users`: For authentication and user management.
-   `watch_listings`: Stores parsed watch trading data, including PID, price, condition, chat ID, sender, and raw message line. Expanded to include Brand, Family, Model Year, and Variant for enriched data.
-   `watch_requirements`: Stores buying requests and "looking for" messages separately from selling listings.
-   `contacts`: Stores contact information for LID resolution, supporting multiple group memberships and organic capture from messages.
-   `processing_logs`: Records the status and errors of message processing.
-   `system_stats`: Stores daily metrics for dashboard display.

### System Design Choices
-   **Data Flow**: WhatsApp messages are processed by an external integration, normalized, deduplicated, parsed using regex, and intelligently routed to appropriate database tables (`watch_listings` for selling, `watch_requirements` for buying requests). The Express API serves this data to the React frontend for display, filtering, and search.
-   **Message Processing**: Features a comprehensive normalizer that handles all inbound event types with consistent output format. Implements proper sender number handling and robust deduplication using composite keys.
-   **Parsing Logic**: Employs sophisticated regex patterns for extracting watch details (PID, price, year, condition) and supports multi-PID parsing from single messages. Includes an advanced offer parser and smart PID matching against a reference database.
-   **API Design**: All API endpoints conform to a consistent RESTful structure, with specific attention to handling GET requests with query strings for data retrieval and POST requests for actions like sending WhatsApp notifications.
-   **Connection Management**: Features professional connection monitoring with automatic re-connection attempts and intelligent status detection, ensuring high availability of the WhatsApp integration.
-   **Dynamic Configuration**: Supports dynamic management of WhatsApp instances, access tokens, and group whitelists, allowing for real-time configuration updates without server restarts.
-   **User Experience**: Prioritizes persistent search filters, sortable columns, real-time name resolution for contacts and groups, standardized date/time formats, robust Excel export functionality, and intelligent status message filtering with clear action-oriented logging. Implements a consistent message dialog system with editable templates and dynamic placeholders.

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