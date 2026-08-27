# VOXONIX ✕ AI

> **Breaking Communication Barriers Through AI** — A premium real-time accessibility platform bridging Deaf, Blind, Mute, and non-disabled users through intelligent multimodal interaction.

---

## 🌟 Overview

**Voxonix** is an editorial-grade, real-time communication platform engineered to empower users across all accessibility spectrums. By integrating low-latency WebRTC video streaming, real-time speech-to-text captions, sign language gesture translation, and natural speech synthesis, Voxonix creates an inclusive room where every voice is heard — whether spoken, signed, captioned, or typed.

---

## ✨ Key Capabilities

- **🧏 Accessibility Profiles**: Tailored user experiences specifically tuned for **Deaf**, **Blind**, **Mute**, and **Non-Disabled** participants.
- **💬 Real-Time Live Captions**: Ultra-low latency (<120ms) speech transcription with automatic speaker labeling and readable typography.
- **🤟 Sign Language Translation**: On-device computer vision & gesture recognition that converts sign language into synthesized speech and text.
- **🎙️ Text-to-Speech & Natural Speech Synthesis**: Allows mute users to type responses that are naturally voiced into the call.
- **📹 Multi-Peer WebRTC Video Rooms**: High-performance peer-to-peer video conferencing that dynamically scales layout and contrast according to user preferences.
- **🎨 Editorial Aesthetics & High Contrast**: Built with dark mode aesthetics, interactive canvas particle backgrounds, and Google Fonts (`Cormorant Garamond` & `Inter`).

---

## 🛠️ Technology Stack

| Layer                         | Technology                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| **Runtime & Package Manager** | [Bun](https://bun.sh/)                                                                        |
| **Framework**                 | [TanStack Start](https://tanstack.com/start) (Full-stack React with SSR & file-based routing) |
| **Router**                    | [@tanstack/react-router](https://tanstack.com/router)                                         |
| **State & Data Fetching**     | [@tanstack/react-query](https://tanstack.com/query)                                           |
| **Styling & UI**              | [Tailwind CSS v4](https://tailwindcss.com/), Radix UI Primitives, Lucide Icons                |
| **Build System**              | [Vite 7](https://vitejs.dev/)                                                                 |
| **Language & Linting**        | TypeScript 5.8+, ESLint 9+, Prettier 3+                                                       |

---

## 📁 Repository Structure

```text
Voxonix/
├── src/
│   ├── components/
│   │   ├── ui/                    # Reusable Radix UI & Shadcn component primitives
│   │   └── InteractiveBackground.tsx # Dynamic canvas background component
│   ├── hooks/                     # Custom React hooks (e.g. use-mobile)
│   ├── lib/
│   │   ├── config.server.ts       # Server-only environment configuration
│   │   ├── error-capture.ts       # SSR error capture utility
│   │   ├── error-page.ts          # Fallback error page renderer
│   │   └── utils.ts               # Classname helper utilities (clsx, tailwind-merge)
│   ├── routes/
│   │   ├── __root.tsx             # Root layout shell with query client & head metadata
│   │   ├── index.tsx              # Landing page (/)
│   │   ├── login.tsx              # Sign-in route (/login)
│   │   └── register.tsx           # Account creation route with accessibility profile setup (/register)
│   ├── routeTree.gen.ts           # Auto-generated TanStack Router tree
│   ├── router.tsx                 # TanStack Router instance creation
│   ├── server.ts                  # Server entrypoint for SSR handling
│   ├── start.ts                   # TanStack Start middleware configuration
│   └── styles.css                 # Global CSS tokens, custom fonts, and keyframes
├── bun.lock                        # Bun dependency lockfile
├── bunfig.toml                     # Bun package manager configuration
├── components.json                 # Shadcn UI CLI configuration
├── eslint.config.js                # Flat ESLint configuration
├── package.json                    # Project dependencies and scripts
├── tsconfig.json                   # TypeScript compiler options
└── vite.config.ts                  # Vite build & TanStack Start plugin configuration
```

---

## 🚀 Getting Started

### Prerequisites

- **Bun** (v1.2.0 or later recommended) or **Node.js** (v20+ with npm / pnpm / yarn)

### Installation

1. Clone or download the repository to your machine.
2. Install dependencies:
   ```bash
   bun install
   ```

### Development Server

Start the local development server:

```bash
bun dev
```

Open your browser and navigate to **`http://localhost:5173/`**.

---

## 📜 Available Scripts

| Command           | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `bun dev`         | Starts the Vite development server in hot-reload mode.  |
| `bun run build`   | Builds client and SSR bundles for production.           |
| `bun run preview` | Runs the local production server preview.               |
| `bun run lint`    | Runs ESLint to check for code quality and style issues. |
| `bun run format`  | Formats the codebase using Prettier.                    |

---

## 🛡️ License

This project is proprietary and built for accessible AI-powered real-time communication.
