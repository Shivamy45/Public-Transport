# Environment Setup

To fix the pickup and drop suggestion functionality, you need to set up the following environment variables:

## Required Environment Variables

Create a `.env.local` file in the project root with the following variables:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Mapbox Configuration (optional for suggestions, required for maps)
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
```

## How to Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings (gear icon)
4. Scroll down to "Your apps" section
5. Click on the web app icon or add a new web app
6. Copy the configuration values

## Issues Fixed

1. **Data Structure Mismatch**: Fixed `buses/page.js` to use `data.stopName` instead of `data.name`
2. **Filtering Logic**: Updated both pages to use `includes()` instead of `startsWith()` for better user experience
3. **Added Debugging**: Added console logs to help identify any remaining issues

## Testing

After setting up the environment variables:
1. Start the development server: `npm run dev`
2. Open the browser console to see debug logs
3. Try typing in the pickup and drop location fields
4. Check if suggestions appear and if the console shows the fetched stops data
