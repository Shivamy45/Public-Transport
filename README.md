# Public Transport Management System (TransitGo)

## Project Rationale and Executive Summary
TransitGo represents a cutting-edge, centralized platform designed to revolutionize the public transport experience. Developed with the latest web technologies, including **Next.js 15.5** and **React 19**, this system bridges the information gap between transit operators and passengers. It provides a real-time, interactive interface for tracking bus fleets, optimizing commute planning, and managing transit operations with unprecedented efficiency.

The primary objective of this initiative was to engineer a high-performance, scalable web application that leverages reactive geospatial data visualization to solve the complex logistical challenge of real-time urban mobility.

---

## Core Functional Components
This platform integrates several sophisticated functionalities to deliver a seamless user experience:

- **Real-Time Geolocation Tracking**  
  Leveraging **Mapbox GL** and **Firebase Firestore**, the system renders the live position of transit vehicles with sub-second latency. This allows passengers to visualize bus movements on an interactive map in real-time, significantly reducing wait-time uncertainty.

- **Dynamic Route Visualization**  
  The application utilizes the **Mapbox Directions API** to project precise route paths and estimated arrival times (ETAs). This component dynamically adjusts to traffic conditions (where supported) and route deviations, ensuring accurate information delivery.

- **Reactive User Interface**  
  Built on **React 19** and **Tailwind CSS 4**, the frontend ensures a fluid, responsive experience across all devices. The interface employs advanced state management to handle high-frequency data updates without compromising render performance.

- **Role-Based Access Control**  
  Secure authentication via **Firebase Auth** segregates functionality between administrators (fleet management) and passengers (view-only access), ensuring data integrity and operational security.

---

## System Architecture Diagram
The system adopts a modern serverless-first architecture, utilizing Next.js for the frontend and API layer, coupled with Firebase for backend services and Mapbox for geospatial intelligence.

```text
+-------------------------------------------------------+
|                   Client Side (Browser)               |
| +---------------------------------------------------+ |
| |                  Next.js Framework                | |
| | (React 19 / Tailwind CSS 4 / Framer Motion)       | |
| +-------------------------+-------------------------+ |
|            ^              |             ^             |
|            | Real-time    |             | Map Tiles   |
|            | Listener     |             | & Routes    |
|            v              v             v             |
+-------------------+  +---------------+  +-------------+
|    Firebase       |  | Next.js API   |  |   Mapbox    |
| - Firestore DB    |  | (Serverless)  |  |     API     |
| - Authentication  |  +---------------+  +-------------+
+-------------------+
```

---

## 🛠️ Technology Stack

### 💻 Core Framework & Language
- ![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js&logoColor=white) **App Router Architecture**
- ![React](https://img.shields.io/badge/React-19-blue?logo=react&logoColor=white) **Server & Client Components**
- ![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow?logo=javascript&logoColor=white)

### 🎨 Styling & UI
- ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?logo=tailwind-css&logoColor=white) **Utility-First Styling**
- ![Framer Motion](https://img.shields.io/badge/Framer_Motion-Animation-purple?logo=framer&logoColor=white) **Fluid Transitions**
- ![Lucide React](https://img.shields.io/badge/Lucide-Icons-orange?logo=lucide&logoColor=white)

### 🌍 Geospatial & Backend
- ![Mapbox](https://img.shields.io/badge/Mapbox-GL_JS-blue?logo=mapbox&logoColor=white) **Interactive Maps**
- ![Firebase](https://img.shields.io/badge/Firebase-Firestore_%26_Auth-orange?logo=firebase&logoColor=white) **Real-time Database**

### 🔧 Build & Tooling
- ![Turbopack](https://img.shields.io/badge/Turbopack-High_Performance-red?logo=vercel&logoColor=white)
- ![ESLint](https://img.shields.io/badge/ESLint-Code_Quality-4B32C3?logo=eslint&logoColor=white)

---

# Build and Deployment Instructions

## Prerequisites
- Node.js (v18+ recommended)
- NPM or Yarn
- Firebase Project Credentials
- Mapbox Public Access Token

---

## 1. Environment Configuration

Create a `.env.local` file in the root directory and populate it with your secure credentials:

```bash
# Mapbox Configuration
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-app-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123...
NEXT_PUBLIC_FIREBASE_APP_ID=1:123...
```

---

## 2. Installation & Development

### Install Dependencies
Execute the following command to install all required packages:
```bash
npm install
# or
yarn install
```

### Run Development Server
Start the high-performance local development server using Turbopack:
```bash
npm run dev
```

Access the application at: `http://localhost:3000`

---

## 3. Production Build

To generate an optimized production build:
```bash
npm run build
```

To start the production server:
```bash
npm start
```
