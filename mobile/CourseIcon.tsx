import React, { memo } from "react";
import { Image } from "react-native";

// Pre-rendered at 3x for crisp icons without runtime SVG parsing or remote requests.
const sources = {
  "back": require("./assets/course-icons/back.png"),
  "mic-yellow": require("./assets/course-icons/mic-yellow.png"),
  "tools-yellow": require("./assets/course-icons/tools-yellow.png"),
  "book-yellow": require("./assets/course-icons/book-yellow.png"),
  "book-coral": require("./assets/course-icons/book-coral.png"),
  "mic-blue": require("./assets/course-icons/mic-blue.png"),
  "timer-blue": require("./assets/course-icons/timer-blue.png"),
  "person-blue": require("./assets/course-icons/person-blue.png"),
  "headphones-purple": require("./assets/course-icons/headphones-purple.png"),
  "puzzle-purple": require("./assets/course-icons/puzzle-purple.png"),
  "person-purple": require("./assets/course-icons/person-purple.png"),
  "person-green": require("./assets/course-icons/person-green.png"),
  "school-green": require("./assets/course-icons/school-green.png"),
  "plane-green": require("./assets/course-icons/plane-green.png"),
  "briefcase-green": require("./assets/course-icons/briefcase-green.png"),
  "flash-green": require("./assets/course-icons/flash-green.png"),
  "tools-green": require("./assets/course-icons/tools-green.png"),
  "writing-blue": require("./assets/course-icons/writing-blue.png"),
};
export type CourseIconName = keyof typeof sources;
export const CourseIcon = memo(function CourseIcon({ name, size = 28 }: { name: CourseIconName; size?: number }) {
  return <Image testID={`course-icon-${name}`} source={sources[name]} style={{ width: size, height: size }} resizeMode="contain" fadeDuration={0} accessible={false} />;
});
export function BackIcon({ size = 28 }: { size?: number }) {
  return <CourseIcon name="back" size={size} />;
}
