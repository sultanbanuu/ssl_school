import { Platform } from "react-native";

// Desktop content grows to 1200px; narrow screens keep their available width.
export const studentContentWidth = Platform.OS === "web" ? 1200 : 700;
