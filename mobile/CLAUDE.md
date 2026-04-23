# Mobile – Claude Code Guide

## Tech Stack

- React Native 0.81, Expo, TypeScript
- React Navigation for routing
- NativeWind for utility-based styling (Tailwind on React Native)
- tRPC React Query for server state
- lucide-react-native for icons

**Note:** This document supersedes any Cursor rules. StyleSheet code coexists during transition; new code uses NativeWind.

## Styling with NativeWind

Apply Tailwind utility classes directly to React Native components:

```typescript
<View className="flex-1 bg-pitch p-4">
  <Text className="text-lg font-body text-on-surface">Hello</Text>
  <Pressable className="bg-primary px-6 py-3 rounded-arena">
    <Text className="text-pitch font-headline">Tap me</Text>
  </Pressable>
</View>
```

Arena theme tokens are in `tailwind.config.js`. Reference by name—never hardcode hex values:
- Surfaces: `bg-pitch`, `bg-turf`, `bg-bench`, `bg-suite`
- Colors: `text-primary`, `bg-secondary`, `border-tertiary`
- Fonts: `font-display`, `font-headline`, `font-body`, `font-arabic`
- Radii: `rounded-arena` (0.375rem), `rounded-arena-lg` (0.75rem max)

## Design System Rules

- No borders for separation; use background colors.
- No radius above `rounded-arena-lg`.
- No drop shadows; elevation via color and spacing.
- No pure white text; use `text-on-surface` (#f9f9fd).
- Cyan (`secondary`) for data display only, never for actions.
- Lime (`primary`) for success and CTAs, never for danger.

## Touch Targets

Minimum 44×44px for interactive elements. Primary CTAs use `min-h-[56px]` for thumb-friendly sizing:

```typescript
<Pressable className="bg-primary min-h-[56px] items-center justify-center rounded-arena">
  <Text className="text-pitch font-headline font-semibold">Primary Action</Text>
</Pressable>
```

## tRPC Integration

Import from `../../../infrastructure/api/trpc`. Invalidate mutations via `trpc.useUtils()`:

```typescript
import { trpc } from '@/infrastructure/api/trpc';

const utils = trpc.useUtils();
const mutation = trpc.post.create.useMutation({
  onSuccess: () => {
    utils.post.list.invalidate();
  },
});
```

## Authentication

Use `useAuth()` from `application/hooks/useAuth`:

```typescript
import { useAuth } from '@/application/hooks/useAuth';

export function ProfileScreen() {
  const { user, logout } = useAuth();

  if (!user) {
    return <Text>Not logged in</Text>;
  }

  return (
    <View>
      <Text>{user.name}</Text>
      <Pressable onPress={logout}>
        <Text>Logout</Text>
      </Pressable>
    </View>
  );
}
```

## Internationalization

Use `react-i18next`:

```typescript
import { useTranslation } from 'react-i18next';

export function PostCard({ post }) {
  const { t } = useTranslation();

  return <Text>{t('post.viewDetails')}</Text>;
}
```

**Critical:** Every new translation key goes in BOTH `infrastructure/i18n/en.json` AND `infrastructure/i18n/ar.json` simultaneously. Never skip a language.

## RTL & Logical Layouts

RTL-first design. Use logical properties:
- `flex-row` (not left-to-right)
- `items-start`, `items-end` (not left/right)
- Avoid hardcoding LTR offsets

Expo handles RTL on iOS and Android natively; our code must be RTL-compatible from the start.

## Lists

Use `FlatList` for >10 items with `keyExtractor` and pull-to-refresh:

```typescript
<FlatList
  data={posts}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <PostCard post={item} />}
  onRefresh={() => refetch()}
  refreshing={isFetching}
/>
```

## Safe Area

Import `SafeAreaView` from `react-native-safe-area-context`, not React Native core:

```typescript
import { SafeAreaView } from 'react-native-safe-area-context';

<SafeAreaView className="flex-1 bg-pitch">
  {/* content */}
</SafeAreaView>
```

## Navigation

Use `useNavigation` and `useRoute` from `@react-navigation/native`. Register new screens in `src/presentation/navigation/AppNavigator.tsx`.

## Utilities

- Icons from `lucide-react-native` only.
- Confirmation dialogs: use `confirm()` from `utils/confirm.ts` (Alert.alert broken on web).

## Schemas

Zod schemas come from `@arena/shared`. Never create new schemas locally.

## Structure

```
src/
├── infrastructure/   # API, i18n, storage
├── application/      # Hooks, business logic
└── presentation/
    ├── navigation/   # Router
    ├── screens/      # Full-screen components
    └── components/
        ├── ui/       # Reusable primitives
        └── arena/    # Domain-specific components
```

## AI Guardrails

- Check existing UI components before creating new ones.
- Check existing i18n keys before adding new translations.
- Every new i18n key goes in both language files.
- Register new screens in the AppNavigator.
- Never use StyleSheet for new Arena code.
