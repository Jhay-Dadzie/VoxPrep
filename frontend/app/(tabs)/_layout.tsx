import { Tabs } from "expo-router";
import { LayoutDashboard, Mic, SquareKanban, User } from "lucide-react-native"
import { Colors } from "@/constants/theme";
import { useColorScheme } from '@/hooks/use-color-scheme'

export default function TabLayout() {
    const colorScheme = useColorScheme()
    return (
        <Tabs screenOptions={{
            tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tabBarActiveIcon,
            tabBarStyle: {
                backgroundColor: Colors[colorScheme ?? 'light'].background,
                borderTopWidth: 1,
                borderTopColor: colorScheme === 'dark' ? '#1E293B' : '#E2E8F0',
                shadowColor: '#000',
                shadowOffset: {width: 0, height: 7},
                shadowOpacity: 5,
                shadowRadius: 4,
                elevation: 10
            },
            headerStyle: {
                backgroundColor: Colors[colorScheme ?? 'light'].background,
                borderBottomWidth: 1,
                borderBottomColor: colorScheme === 'dark' ? '#1E293B' : '#E2E8F0',
                shadowColor: '#000',
                shadowOffset: {width: 0, height: 7},
                shadowOpacity: 5,
                shadowRadius: 4,
                elevation: 10
            }
        }}
        >
            <Tabs.Screen name="dashboard" options={{
                title: "Dashboard",
                tabBarIcon: ({color}) => <LayoutDashboard size={20} color={color}/>,
                
            }}/>
            <Tabs.Screen name="practice" options={{
                title: "Practice",
                tabBarIcon: ({color}) => <Mic size={20} color={color}/>
            }}/>
            <Tabs.Screen name="results" options={{
                title: "Results",
                tabBarIcon: ({color}) => <SquareKanban size={20} color={color}/>
            }}/>
            <Tabs.Screen name="profile" options={{
                title: "Profile",
                tabBarIcon: ({color}) => <User size={20} color={color}/>
            }}/>
        </Tabs>
    )
}