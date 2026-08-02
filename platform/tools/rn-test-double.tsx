/**
 * React Native, as host elements, for the test runner only.
 *
 * React Native's own entry point is Flow-typed source that only its Metro
 * bundler parses, so a Node test runner cannot import it. This maps each
 * primitive a patient screen uses onto a host element of the same name and
 * passes every prop through untouched — so a rendered tree still shows the
 * real accessibility roles, labels, states and handlers, and a test asserting
 * on them is asserting on what the screen actually declares.
 *
 * It deliberately implements no behaviour. Anything that needed a real
 * implementation here would be logic living in a component, which is the thing
 * Rule 4 forbids and the reducer already owns.
 */
import * as React from "react";

const host = (name: string) =>
  function Host(props: Record<string, unknown>) {
    return React.createElement(name, props, props["children"] as React.ReactNode);
  };

export const View = host("View");
export const Text = host("Text");
export const Pressable = host("Pressable");
export const ScrollView = host("ScrollView");
export const TextInput = host("TextInput");
export const ActivityIndicator = host("ActivityIndicator");
export const Image = host("Image");
export const SafeAreaView = host("SafeAreaView");

/** The tests render the light scheme; the dark palette is measured for
 *  contrast in the design package's own suite. */
export const useColorScheme = () => "light" as const;

export const StyleSheet = {
  create: <T,>(s: T): T => s,
  flatten: <T,>(s: T): T => s,
  absoluteFillObject: {},
  hairlineWidth: 1,
};

export const Platform = { OS: "ios" as const, select: <T,>(o: { ios?: T; android?: T; default?: T }) => o.ios ?? o.default };
