# In-Sync CRM

A comprehensive CRM application for managing contacts, clients, campaigns, invoicing, and more.

## Tech Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS + shadcn-ui
- **Backend:** Supabase (PostgreSQL + Edge Functions + Auth + Storage)
- **Hosting:** Azure Static Web Apps
- **AI:** Gemini API (document extraction, campaign analysis, pipeline insights)
- **Integrations:** Exotel (calling), Resend (email), Razorpay (payments), WhatsApp

## Development

```sh
# Install dependencies
npm install

# Start dev server
npm run dev
```

## Deployment

The app deploys automatically to Azure Static Web Apps via GitHub Actions on push to `main`.

## Custom Domain

Production URL: https://go.in-sync.co.in
