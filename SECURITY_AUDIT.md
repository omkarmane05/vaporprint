# VaporPrint Security & Architecture Audit Report
**Date:** April 6, 2026
**Status:** CRITICAL VULNERABILITIES IDENTIFIED

## Executive Summary
An audit of the VaporPrint (`quick-print-share-main`) codebase was performed focusing on security, data privacy, and production readiness. While significant progress has been made with the `security_hardening.sql` migration, several critical vulnerabilities remain that could lead to unauthorized data access and intercept of sensitive documents.

---

## 1. Security Vulnerabilities

### 1.1 Broadcast Interception (CRITICAL)
- **Location:** `src/pages/CustomerUpload.tsx` & `src/pages/ShopDashboard.tsx`
- **Issue:** Files are streamed using Supabase Realtime Broadcast on a channel named `vprint-relay-${shopId}`.
- **Risk:** Supabase Broadcast channels are public. Any user (including anonymous ones) who knows or guesses a `shopId` can subscribe to this channel via the browser console and intercept every chunk of data being uploaded. Since the `shopId` is exposed in the URL, this is a significant privacy leak.
- **Recommendation:** 
  - Implement client-side encryption (AES-256) for file chunks before broadcasting.
  - The encryption key could be part of the `shopId` (e.g., `shopId#encryptionKey`) or derived from a secure handshake.
  - Alternatively, use Supabase Storage with highly restrictive RLS and auto-deletion.

### 1.2 Excessive RLS Permissions (HIGH)
- **Location:** `supabase/migrations/20260405083000_security_hardening.sql`
- **Issue:** 
  - `shops_select_public`: Allows `SELECT *` for anyone. Exposes `owner_email` and other metadata.
  - `invitations_select_public`: Allows `SELECT *` for anyone. Exposes invitation tokens and emails for pending shops.
- **Risk:** Scraping of user emails and potential takeover of pending shops if tokens are leaked.
- **Recommendation:** 
  - Restrict `shops` SELECT to specific columns (`id`, `name`, `status`).
  - Restrict `invitations` SELECT or remove it entirely (logic for activation should be handled by a secure RPC call).

### 1.3 Insecure RPC Definition (MEDIUM)
- **Location:** `activate_shop` function in `security_hardening.sql`
- **Issue:** While it uses `SECURITY DEFINER`, it trusts the `p_shop_id` passed by the client.
- **Risk:** Minor, but could be hardened further.
- **Recommendation:** Ensure `auth.uid()` is used strictly to link the ownership. (Currently done correctly, but keep an eye on it).

### 1.4 Hardcoded TURN Credentials (LOW)
- **Location:** `src/pages/ShopDashboard.tsx` (Line 81)
- **Issue:** Hardcoded credentials for `metered.ca` TURN server.
- **Risk:** Minor abuse of the trial account.
- **Recommendation:** Move to `.env` variables.

---

## 2. Code Quality & UX

### 2.1 Base64 Streaming Overhead
- **Issue:** Files are converted to base64 strings for broadcasting. This adds ~33% to the data size.
- **Recommendation:** Check if Supabase Realtime supports raw Binary/Uint8Array for broadcast to reduce latency and bandwidth.

### 2.2 Popup Blocker Issues
- **Location:** `ShopDashboard.tsx` (Line 157)
- **Issue:** Using `window.open` asynchronously (after a database call) is often blocked by modern browsers.
- **Recommendation:** Create the window immediately upon user interaction and update its URL once the job is verified.

---

## 3. Remediation Plan

### Phase 1 (Immediate)
1.  **Harden RLS**: Modify `security_hardening.sql` to restrict column visibility.
2.  **Secure Invitations**: Remove public access to the `invitations` table.

### Phase 2 (Architecture)
1.  **Broadcast Security**: Implement E2EE for the realtime stream or switch to a "Pull" model via restricted Storage buckets.
2.  **Job Validation**: Add database-level constraints on `file_size` and `file_data_url` length.

---

**Audit Performed by Antigravity AI**
