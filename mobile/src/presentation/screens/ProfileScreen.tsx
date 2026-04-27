import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { trpc } from "../../infrastructure/api/trpc";
import { useAuth } from "../../application/hooks/useAuth";

export function ProfileScreen() {
  const { user } = useAuth();
  const { data: profile, isLoading } = trpc.user.getMe.useQuery();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{profile?.fullName}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{profile?.email}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Account Status</Text>
          <Text style={[styles.value, styles.success]}>
            {profile?.isActive ? "Active" : "Inactive"}
          </Text>
        </View>

        {profile?.roles && profile.roles.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.label}>Roles</Text>
            {profile.roles.map((role: any) => (
              <View key={role.id} style={styles.badge}>
                <Text style={styles.badgeText}>{role.name}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.editButton}>
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 18,
    fontWeight: "500",
  },
  success: {
    color: "#34C759",
  },
  badge: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  editButton: {
    backgroundColor: "#007AFF",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  editButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
