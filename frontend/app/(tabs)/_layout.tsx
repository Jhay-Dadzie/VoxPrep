import { Tabs } from "expo-router";
import { LayoutDashboard, Mic, SquareKanban, User } from "lucide-react-native"
import { Colors } from "@/constants/theme";
import { useColorScheme } from '@/hooks/use-color-scheme'
import { View, Text, Pressable } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";

// Helper function to convert hex to RGBA
function hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const colorScheme = useColorScheme()
    const colors = Colors[colorScheme ?? 'light']
    const isDark = colorScheme === 'dark'
    
    return (
        <View style={{
            flexDirection: 'row',
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: isDark ? '#1E293B' : '#E2E8F0',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 7 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 5,
        }}>
            {state.routes.map((route, index) => {
                const { options } = descriptors[route.key];
                const isFocused = state.index === index;

                const onPress = () => {
                    const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                    });

                    if (!isFocused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                    }
                };

                const label = options.title || route.name;
                const icon = options.tabBarIcon?.({
                    focused: isFocused,
                    color: isFocused ? colors.tabBarActiveIcon : '#94A3B8',
                    size: 24
                });

                return (
                    <Pressable
                        key={route.key}
                        onPress={onPress}
                        style={{
                            flex: 1,
                            justifyContent: 'center',
                            alignItems: 'center',
                            paddingVertical: 8,
                            borderTopWidth: isFocused ? 3 : 0,
                            borderTopColor: isFocused ? colors.tabBarActiveIcon : 'transparent',
                            backgroundColor: isFocused 
                                ? hexToRgba(colors.tabBarActiveIcon, 0.12) 
                                : 'transparent',
                            borderRadius: 12,
                            marginHorizontal: 4,
                            marginVertical: 4,
                        }}
                    >
                        {icon}
                        <Text style={{
                            color: isFocused ? colors.tabBarActiveIcon : '#94A3B8',
                            marginTop: 4,
                            fontSize: 12,
                            fontWeight: isFocused ? '600' : '400',
                        }}>
                            {label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export default function TabLayout() {
    const colorScheme = useColorScheme()
    const colors = Colors[colorScheme ?? 'light']
    
    return (
        <Tabs
            tabBar={props => <CustomTabBar {...props} />}
            screenOptions={{
                headerStyle: {
                    backgroundColor: colors.background,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 7 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    elevation: 5
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