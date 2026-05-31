import { useState } from "react";
import { View, TextInput, StyleSheet, Pressable, TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";

type InputProps = TextInputProps & {
    label?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    rightIcon?: keyof typeof Ionicons.glyphMap;
    onRightPress?: () => void;
    password?: boolean;
    error?: string;
    helper?: string;
};

export default function Input({
    label, icon, rightIcon, onRightPress, password, error, helper, style, ...rest
}: InputProps) {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'light'];
    const [hide, setHide] = useState(!!password);
    const borderColor = error ? colors.danger : colors.border;

    return (
        <View style={{ marginBottom: 14 }}>
            {label && (
                <ThemedText style={[styles.label, { color: colors.oppositeColor }]}>{label}</ThemedText>
            )}
            <View style={[styles.box, { borderColor, backgroundColor: colors.inputBg }]}>
                {icon && (
                    <Ionicons name={icon} size={18} color={colors.muted} style={{ marginRight: 8 }} />
                )}
                <TextInput
                    placeholderTextColor={colors.muted}
                    secureTextEntry={hide}
                    style={[styles.input, { color: colors.oppositeColor }, style]}
                    {...rest}
                />
                {password && (
                    <Pressable onPress={() => setHide(h => !h)} hitSlop={10}>
                        <Ionicons name={hide ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.muted} />
                    </Pressable>
                )}
                {rightIcon && !password && (
                    <Pressable onPress={onRightPress} hitSlop={10}>
                        <Ionicons name={rightIcon} size={20} color={colors.muted} />
                    </Pressable>
                )}
            </View>
            {error ? (
                <View style={styles.errRow}>
                    <Ionicons name="alert-circle" size={14} color={colors.danger} />
                    <ThemedText style={[styles.err, { color: colors.danger }]}>{error}</ThemedText>
                </View>
            ) : helper ? (
                <ThemedText style={[styles.helper, { color: colors.muted }]}>{helper}</ThemedText>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    label: { fontSize: 13, fontWeight: '500', marginBottom: 6, lineHeight: 18 },
    box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48 },
    input: { flex: 1, fontSize: 15 },
    err: { fontSize: 12, marginLeft: 4, lineHeight: 16 },
    errRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    helper: { fontSize: 12, marginTop: 4, lineHeight: 16 },
});
