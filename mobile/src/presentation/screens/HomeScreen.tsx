import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { trpc } from "../../infrastructure/api/trpc";
import { useAuth } from "../../application/hooks/useAuth";

export function HomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { data: usersData, isLoading } = trpc.user.getMany.useQuery(
    { limit: 10 },
    { enabled: !!user }
  );
  const users = usersData?.users;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {user?.fullName}!</Text>
          <Text style={styles.subtitle}>Welcome to your dashboard</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Account</Text>
          <Text style={styles.cardText}>Email: {user?.email}</Text>
          <TouchableOpacity
            style={styles.cardButton}
            onPress={() => navigation.navigate("Profile")}
          >
            <Text style={styles.cardButtonText}>View Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Users ({usersData?.total || 0})</Text>
          {isLoading ? (
            <ActivityIndicator />
          ) : (
            users?.slice(0, 5).map((u: any) => (
              <View key={u.id} style={styles.userItem}>
                <Text style={styles.userName}>{u.name}</Text>
                <Text style={styles.userEmail}>{u.email}</Text>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  greeting: {
    fontSize: 24,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#fff",
    padding: 20,
    margin: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  cardText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  cardButton: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    alignItems: "center",
  },
  cardButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  userItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  userName: {
    fontSize: 16,
    fontWeight: "500",
  },
  userEmail: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  logoutButton: {
    margin: 16,
    padding: 16,
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    alignItems: "center",
  },
  logoutButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
