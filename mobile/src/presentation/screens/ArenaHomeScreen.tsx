import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ArenaHomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-pitch">
      <View className="flex-1 items-center justify-center px-4">
        <Text className="font-display text-5xl font-bold text-primary mb-8">
          Arena
        </Text>
        <Pressable className="bg-primary px-6 py-3 rounded-arena min-h-14 items-center justify-center">
          <Text className="text-pitch font-headline text-lg font-semibold">
            Play Now
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
