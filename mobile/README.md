# Mobile App (React Native + Expo)

Clean Architecture mobile app with tRPC integration.

## Structure

```
mobile/
└── src/
    ├── infrastructure/    # External integrations
    │   ├── api/          # tRPC client setup
    │   └── storage/      # Secure storage (tokens)
    ├── application/      # Business logic
    │   └── hooks/        # React hooks (useAuth, etc.)
    ├── presentation/     # UI layer
    │   ├── navigation/   # Navigation setup
    │   └── screens/      # Screen components
    └── shared/           # Utilities
```

## Quick Start

```bash
# Install dependencies
npm install

# Start Expo dev server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

## Configuration

### API URL

Edit `src/infrastructure/api/client.ts`:

```typescript
const API_URL = __DEV__ 
  ? "http://localhost:3000"        // iOS Simulator
  : "https://api.yourapp.com";

// For Android Emulator, use:
// ? "http://10.0.2.2:3000"

// For Physical Device, use your machine IP:
// ? "http://192.168.1.100:3000"
```

### Find Your Machine IP

**Mac/Linux:**
```bash
ipconfig getifaddr en0
```

**Windows:**
```bash
ipconfig
```

## Using tRPC

Same API as web frontend - full type safety!

```typescript
import { trpc } from '@/infrastructure/api/trpc';

function MyScreen() {
  // Query
  const { data, isLoading } = trpc.user.getAll.useQuery();
  
  // Mutation
  const updateUser = trpc.user.update.useMutation();
  
  return <View>...</View>;
}
```

## Building for Production

```bash
# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

## Customization

- **Screens**: Add to `src/presentation/screens/`
- **Navigation**: Modify `src/presentation/navigation/AppNavigator.tsx`
- **Styling**: Update styles in screen components
- **API**: Automatically synced with backend via tRPC types

---

**Type-safe, clean, and ready for AI-assisted development** 🚀
