# Design

The UI uses the **UX v2.7 Hybrid Prototype** design system verbatim
(`AI-Content-Studio-Complete-Package-v2.7/03_Interactive_Prototype`): tokens and component
classes live in `src/app/globals.css` (prototype CSS first, live-product additions after).

- Layout: collapsible sidebar (Workspace / Manage), topbar, Project + Content Detail with a
  collapsible Creative Agent panel; mobile drawer + Project/Agent switch.
- Live states (generating, rendering, composing, scheduled, published) update via Supabase Realtime.
- Review is selection-only: every field is a dropdown of AI-generated options.
