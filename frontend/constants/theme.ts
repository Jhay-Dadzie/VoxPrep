import { Platform } from "react-native";

const tintColorLight = '#004AC6';
const tintColorDark = '#2563EB';

export const Colors = {
    light: {
        text: '#6B7280',
        oppositeColor: '#111827',
        background: '#ECEEFE',
        tint: tintColorLight,
        icon: '#9CA3AF',
        tabBarActiveIcon: tintColorLight,
        border: '#E2E8F0',
        // Extended tokens for richer screens (auth, dashboard, etc.)
        card: '#FFFFFF',
        subtext: '#6B7280',
        muted: '#9CA3AF',
        inputBg: '#F3F4FB',
        brandSoft: '#E6EAFD',
        divider: '#F3F4F6',
        success: '#16A34A',
        successBg: '#DCFCE7',
        warning: '#F59E0B',
        warningBg: '#FEF3C7',
        danger: '#EF4444',
        dangerBg: '#FEE2E2',
    },
    dark: {
        text: '#C3C6D7',
        oppositeColor: '#E1E2ED',
        background: '#141A2F',
        tint: tintColorDark,
        icon: '#C3C6D7',
        tabBarActiveIcon: '#B4C5FF',
        border: '#1E293B',
        card: '#161B2E',
        subtext: '#9CA3AF',
        muted: '#6B7280',
        inputBg: '#1E2440',
        brandSoft: '#1E2A55',
        divider: '#222A45',
        success: '#22C55E',
        successBg: '#14532D',
        warning: '#FBBF24',
        warningBg: '#78350F',
        danger: '#F87171',
        dangerBg: '#7F1D1D',
    }
}
