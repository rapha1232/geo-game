import { MAP_STYLES, type GameMapLabels, type MapStyle } from "@meridian/ui";
import { t, type MessageKey } from "../i18n";

/** Names of the map styles, for the switcher on every map and the picker in Settings. */
export const mapStyleNames = (): Record<MapStyle, string> =>
  Object.fromEntries(MAP_STYLES.map((s) => [s, t(`map.style.${s}` as MessageKey)])) as Record<
    MapStyle,
    string
  >;

export const mapStyleDescriptions = (): Record<MapStyle, string> =>
  Object.fromEntries(MAP_STYLES.map((s) => [s, t(`map.style.${s}.desc` as MessageKey)])) as Record<
    MapStyle,
    string
  >;

/** The `mapStyle` entry of GameMap labels: adds the style switcher to the map controls. */
export const mapStyleLabel = () => ({ label: t("map.style"), names: mapStyleNames() });

/** Labels for every GameMap: zoom controls, keyboard announcements, the touch loupe and the style switcher. */
export const mapLabels = (): GameMapLabels => ({
  zoomIn: t("map.zoomIn"),
  zoomOut: t("map.zoomOut"),
  zoomReset: t("map.zoomReset"),
  focused: (name: string) => name,
  loupeHint: t("map.loupeHint"),
  pinAt: (lat: number, lon: number) => t("map.pinAt", { lat, lon }),
  mapStyle: mapStyleLabel(),
});
