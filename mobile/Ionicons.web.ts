import createIconSet from "@expo/vector-icons/createIconSet";
import glyphMap from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";

// Keep the web font outside assets/node_modules: static hosts can exclude that
// directory, returning the SPA HTML fallback and leaving every icon blank.
export const Ionicons = createIconSet(
  glyphMap,
  "ionicons",
  require("./assets/fonts/Ionicons.ttf"),
);
