import React, { useRef, useState, useEffect } from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import Button  from '@/components/button';
import {
  FlatList,
  Dimensions,
  StyleSheet,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Animated,
} from 'react-native';
import { Link, router } from 'expo-router';
import { MoveRight } from 'lucide-react-native';

const { width } = Dimensions.get('window');

type Slide = {
  id: string;
  title: string;
  description: string;
  image: any;
};

const slides: Slide[] = [
  {
    id: '1',
    title: 'Master Your Interview Skill With AI Coaching',
    description:
      'Have a real-time interview with our advanced AI mentor.',
    image: require('@/assets/images/interviewSession.png'),
  },
  {
    id: '2',
    title: 'Realistic AI Interviewer',
    description:
      'Practice with an AI that speaks naturally and evaluates your response in real-time.',
    image: require('@/assets/images/interviewer.png'),
  },
  {
    id: '3',
    title: 'Instant Feedback',
    description:
      'Get a review of your answers, and suggestions',
    image: require('@/assets/images/trackProgress.png'),
  },
];

export default function OnboardingScreen() {
  const colorScheme = useColorScheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const dotAnimations = useRef(slides.map(() => new Animated.Value(0))).current;
  const colors = Colors[colorScheme ?? 'light']
  
  useEffect(() => {
    slides.forEach((_, index) => {
      Animated.timing(dotAnimations[index], {
        toValue: index === currentIndex ? 1 : 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    });
  }, [currentIndex]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(
      event.nativeEvent.contentOffset.x / width
    );
    setCurrentIndex(index);
  };

  const handleNextSlide = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    }
  };

  const renderItem = ({ item }: { item: Slide }) => {
    return (
      <ThemedView style={styles.slide}>
        <ThemedView style={[styles.card, {backgroundColor: colorScheme === 'light' ? '#EDEBFF' : Colors.dark.tint}]}>
          <Image source={item.image} style={styles.image} />
        </ThemedView>

        <ThemedText type='title' style={[styles.title, {color: colors.oppositeColor}]}>{item.title}</ThemedText>
        <ThemedText type='description' style={[styles.description]}>{item.description}</ThemedText>
      </ThemedView>
    );
  };

  return (
    <ThemedView style={{flex: 1}}>
      {/* Header */}
      <ThemedView style={styles.header}>
        <ThemedText style={styles.logo}>VoxPrep</ThemedText>
        <ThemedText type='link' onPress={() => router.push('/(authScreens)/signup')}>Skip</ThemedText>
        
      </ThemedView>

      <ThemedView>
          {/* Slides */}
        <FlatList
          contentContainerStyle= {
            {paddingBottom: 40}
          }
          ref={flatListRef}
          data={slides}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          keyExtractor={(item) => item.id}
        />

        {/* Pagination Dots */}
        <ThemedView style={styles.pagination}>
          {slides.map((_, index) => {
            const width = dotAnimations[index].interpolate({
              inputRange: [0, 1],
              outputRange: [5, 25],
            });

            const backgroundColor = dotAnimations[index].interpolate({
              inputRange: [0, 1],
              outputRange: ['#D3D3D3', getActiveDotColor(colorScheme)],
            });

            return (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    width,
                    backgroundColor,
                  },
                ]}
              />
            );
          })}
        </ThemedView>
      </ThemedView>

      {
        currentIndex === 0 || currentIndex === 1 ? (
          <ThemedView style={{marginTop: 30, marginHorizontal: 20}}>
            <Button action={handleNextSlide}>
              <ThemedText type='placeholderText'>Next</ThemedText>
              <MoveRight color={'#fff'}/>
            </Button>
          </ThemedView>
        ) : currentIndex === 2 && (
          <ThemedView style={{marginTop: 30, marginHorizontal: 20}}>
            <Button action={() => router.push('/(authScreens)/signup')}>
              <ThemedText type='placeholderText'>Get Started</ThemedText>
              <MoveRight color={'#fff'}/>
            </Button>
          </ThemedView>
        )
      }

      
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
  },

  logo: {
    fontSize: 18,
    fontWeight: '600',
  },

  slide: {
    width,
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 20,
  },

  card: {
    width: '100%',
    height: 280,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },

  image: {
    width: '100%',
    height: '100%',
    borderRadius: 24
  },

  title: {
    marginVertical: 10,
    textAlign: 'center'
  },

  description: {
    textAlign: 'center',
    lineHeight: 30
  },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 170,
  },

  dot: {
    height: 5,
    borderRadius: 100,
    marginHorizontal: 5,
  },
});

const getActiveDotColor = (scheme: string | null | undefined) => {
  return Colors[(scheme ?? 'light') as keyof typeof Colors].tint;
};
