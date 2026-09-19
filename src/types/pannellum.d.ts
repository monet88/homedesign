declare module "pannellum/build/pannellum.js" {
  export interface PannellumHotSpotConfig {
    id?: string;
    pitch: number;
    yaw: number;
    type: "scene" | "info";
    text?: string;
    URL?: string;
    attributes?: Record<string, string>;
    sceneId?: string;
    targetPitch?: number;
    targetYaw?: number;
    targetHfov?: number;
    cssClass?: string;
    createTooltipFunc?: (hotSpotDiv: HTMLElement, args: unknown) => void;
    createTooltipArgs?: unknown;
    clickHandlerFunc?: (event: MouseEvent, args: unknown) => void;
    clickHandlerArgs?: unknown;
  }

  export interface PannellumSceneConfig {
    title?: string;
    type?: "equirectangular" | "cubemap" | "multires";
    panorama?: string;
    haov?: number;
    vaov?: number;
    vOffset?: number;
    yaw?: number;
    pitch?: number;
    hfov?: number;
    minHfov?: number;
    maxHfov?: number;
    minPitch?: number;
    maxPitch?: number;
    minYaw?: number;
    maxYaw?: number;
    hotSpots?: PannellumHotSpotConfig[];
    autoLoad?: boolean;
    autoRotate?: number;
    compass?: boolean;
    northOffset?: number;
    preview?: string;
  }

  export interface PannellumTourConfig {
    default?: {
      firstScene?: string;
      sceneFadeDuration?: number;
      autoLoad?: boolean;
      autoRotate?: number;
      showControls?: boolean;
      showFullscreenCtrl?: boolean;
      showZoomCtrl?: boolean;
      compass?: boolean;
      hotSpotDebug?: boolean;
      orientationOnByDefault?: boolean;
      hfov?: number;
      minHfov?: number;
      maxHfov?: number;
      pitch?: number;
      yaw?: number;
    };
    scenes?: Record<string, PannellumSceneConfig>;
  }

  export interface PannellumViewerInstance {
    destroy: () => void;
    loadScene: (sceneId: string, pitch?: number, yaw?: number, hfov?: number) => PannellumViewerInstance;
    getScene: () => string;
    addScene: (sceneId: string, config: PannellumSceneConfig) => PannellumViewerInstance;
    removeScene: (sceneId: string) => boolean;
    toggleFullscreen: () => PannellumViewerInstance;
    getConfig: () => Record<string, unknown>;
    getContainer: () => HTMLElement;
    addHotSpot: (hs: PannellumHotSpotConfig, sceneId?: string) => PannellumViewerInstance;
    removeHotSpot: (hotSpotId: string, sceneId?: string) => boolean;
    resize: () => void;
    isLoaded: () => boolean;
    isOrientationSupported: () => boolean;
    startOrientation: () => void;
    stopOrientation: () => void;
    isOrientationActive: () => boolean;
    mouseEventToCoords: (event: MouseEvent) => [number, number];
    getPitch: () => number;
    setPitch: (pitch: number, animated?: boolean | number) => PannellumViewerInstance;
    getYaw: () => number;
    setYaw: (yaw: number, animated?: boolean | number) => PannellumViewerInstance;
    getHfov: () => number;
    setHfov: (hfov: number, animated?: boolean | number) => PannellumViewerInstance;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    off: (event: string, listener?: (...args: unknown[]) => void) => void;
  }

  export interface PannellumGlobal {
    viewer: (
      container: HTMLElement | string,
      config: PannellumSceneConfig | PannellumTourConfig | Record<string, unknown>
    ) => PannellumViewerInstance;
  }

  const pannellum: PannellumGlobal;
  export default pannellum;
}

interface Window {
  pannellum?: {
    viewer: (
      container: HTMLElement | string,
      config: unknown
    ) => import("pannellum/build/pannellum.js").PannellumViewerInstance;
  };
}
