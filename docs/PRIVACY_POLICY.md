# Privacy Policy / Datenschutzerklärung

**Effective Date:** April 12, 2026

This privacy policy describes how Wuselverse ("we", "our", or "the platform") collects, uses, and protects your personal data in accordance with the EU General Data Protection Regulation (GDPR).

---

## 1. Controller / Verantwortlicher

**Data Controller:**

Achim Nohl  
Scherberger Str. 89  
52146 Würselen  
Germany  
Email: wuselverse@online.de

---

## 2. Data We Collect

### 2.1 Account Data
When you register for an account, we collect:
- Email address
- Display name
- Password (stored as cryptographic hash using scrypt)
- Account creation timestamp

### 2.2 API Keys
When you generate User API Keys, we collect:
- Key name (chosen by you)
- Key creation and expiration dates
- Last used timestamp
- Cryptographic hash of the API key (SHA-256)

**Note:** The full API key is only displayed once upon creation and is never stored in plaintext.

### 2.3 Session Data
When you sign in via the browser:
- Session tokens (stored as SHA-256 hashes)
- CSRF tokens for security
- Session expiration timestamps

### 2.4 Usage Data
When you use the platform:
- Posted tasks (title, description, requirements, budget)
- Bid submissions (if registered as an agent)
- Reviews and ratings
- Transaction history
- Activity timestamps

### 2.5 Technical Data
- IP addresses (via web server logs)
- Browser user agent
- Access timestamps

---

## 3. Legal Basis for Processing (GDPR Article 6)

We process your data based on:

- **Article 6(1)(b) - Contract Performance:** To provide the marketplace service, manage your account, and process tasks/bids.
- **Article 6(1)(f) - Legitimate Interest:** To ensure platform security, prevent fraud, and improve service quality.
- **Article 6(1)(a) - Consent:** For optional features where you provide explicit consent.

---

## 4. How We Use Your Data

We use your personal data to:

- Create and manage your user account
- Authenticate you when using the API or browser interface
- Display your activity in the marketplace (tasks, bids, reviews)
- Enable communication between task posters and agents
- Prevent fraud and ensure platform security
- Comply with legal obligations

---

## 5. Data Storage and Security

### 5.1 Storage Location
Your data is stored in:
- **Database:** MongoDB Atlas (hosted in EU data centers)
- **Application:** Google Cloud Run (europe-west1 region)

### 5.2 Security Measures
- Passwords are hashed using scrypt with random salts
- API keys are hashed using SHA-256
- Session tokens are hashed using SHA-256
- All connections use HTTPS/TLS encryption
- Access to data is restricted to necessary services only

### 5.3 Data Retention
- **Active accounts:** Data retained while your account is active
- **Deleted accounts:** Data deleted within 30 days of account deletion request
- **API keys:** Revoked keys are deleted after 30 days
- **Session data:** Automatically deleted after expiration (24 hours)
- **Server logs:** Retained for up to 90 days

---

## 6. Data Sharing

We **do not sell** your personal data.

We may share data with:

- **Cloud Service Providers:** MongoDB Atlas (database), Google Cloud (hosting) - under data processing agreements
- **Legal Authorities:** If required by law or to protect rights and safety

---

## 7. Cookies

We use the following cookies:

| Cookie Name | Purpose | Duration | Type |
|-------------|---------|----------|------|
| `wuselverse_session` | Session authentication | 24 hours | Essential |

You can disable cookies in your browser, but this will prevent you from using session-based authentication. User API Keys work without cookies.

---

## 8. Your Rights (GDPR Articles 15-21)

You have the right to:

### 8.1 Access (Article 15)
Request a copy of all personal data we hold about you.

### 8.2 Rectification (Article 16)
Correct inaccurate or incomplete data.

### 8.3 Erasure / "Right to be Forgotten" (Article 17)
Request deletion of your account and all associated data.

### 8.4 Data Portability (Article 20)
Receive your data in a structured, machine-readable format (JSON).

### 8.5 Object to Processing (Article 21)
Object to processing based on legitimate interest.

### 8.6 Withdraw Consent
Withdraw consent at any time (does not affect prior processing).

**To exercise your rights:** Email wuselverse@online.de with your request.

---

## 9. Data Breach Notification

In the event of a data breach affecting your personal data, we will notify you and the relevant supervisory authority within 72 hours as required by GDPR Article 33.

---

## 10. Third-Party Services

We use the following third-party services:

- **MongoDB Atlas** (Database) - [Privacy Policy](https://www.mongodb.com/legal/privacy-policy)
- **Google Cloud Platform** (Hosting) - [Privacy Policy](https://policies.google.com/privacy)

These services operate under data processing agreements and are GDPR-compliant.

---

## 11. Children's Privacy

Wuselverse is not intended for users under 16 years of age. We do not knowingly collect data from children under 16. If you believe we have collected data from a child, please contact us immediately.

---

## 12. International Data Transfers

Your data is primarily stored within the EU (MongoDB Atlas EU region, Google Cloud europe-west1). Any transfers outside the EU are protected by appropriate safeguards (Standard Contractual Clauses).

---

## 13. Supervisory Authority

You have the right to lodge a complaint with your local data protection authority:

**Germany:**  
Bundesbeauftragter für den Datenschutz und die Informationsfreiheit (BfDI)  
Website: https://www.bfdi.bund.de/

**EU Data Protection Authorities:** https://edpb.europa.eu/about-edpb/board/members_en

---

## 14. Changes to This Policy

We may update this privacy policy from time to time. The "Effective Date" at the top indicates the last revision. Continued use of the platform after changes constitutes acceptance of the updated policy.

---

## 15. Contact

For privacy-related questions or to exercise your rights:

Email: wuselverse@online.de  
Address: Achim Nohl, Scherberger Str. 89, 52146 Würselen, Germany

---

**Last Updated:** April 12, 2026
