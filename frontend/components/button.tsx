import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { StyleSheet, TouchableOpacity } from "react-native";
import { View } from "react-native";
import { useState } from "react";

type buttonProps = {
    children: React.ReactNode,
    action?: () => void,
    disabled?: boolean
}
export default function Button({ children, action, disabled }: buttonProps) {
    const colorScheme = useColorScheme()
    const colors = Colors[colorScheme ?? 'light']
    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={disabled ? undefined : action}
            disabled={disabled}
            style={[styles.button,
                {
                    backgroundColor: disabled ? '#A0A0A0' : colors.tint,
                    opacity: disabled ? 0.6 : 1
                }
            ]}
        >
            <View style={styles.childrenStyle}>{children}</View>
        </TouchableOpacity>
    )
}

const styles = StyleSheet.create({
    button: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 15,
        borderRadius: 28,
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowOffset: {width: 0, height: 2},
        elevation: 5

    },

    childrenStyle: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15
    }
    
})