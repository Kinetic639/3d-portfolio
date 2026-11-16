import * as THREE from "three";

export type EnvironmentWindState = {
  enabled: boolean;
  direction: THREE.Vector2;
  strength: number;
  speed: number;
  gustStrength: number;
  gustFrequency: number;
  turbulence: number;
};

export type EnvironmentState = {
  wind: EnvironmentWindState;
};

export type EnvironmentWindPreset = "calm" | "lightBreeze" | "windy" | "strongWind" | "storm";

export type GlobalWindUniforms = {
  uWindTime: { value: number };
  uWindDirection: { value: THREE.Vector2 };
  uWindStrength: { value: number };
  uWindSpeed: { value: number };
  uWindGust: { value: number };
  uWindTurbulence: { value: number };
};

const DEFAULT_DIRECTION_DEGREES = 32;

export const ENVIRONMENT_WIND_PRESETS: Record<EnvironmentWindPreset, Omit<EnvironmentWindState, "direction">> = {
  calm: {
    enabled: true,
    strength: 0,
    speed: 0.45,
    gustStrength: 0,
    gustFrequency: 0.08,
    turbulence: 0.02,
  },
  lightBreeze: {
    enabled: true,
    strength: 0.3,
    speed: 0.72,
    gustStrength: 0.12,
    gustFrequency: 0.1,
    turbulence: 0.12,
  },
  windy: {
    enabled: true,
    strength: 0.72,
    speed: 1,
    gustStrength: 0.28,
    gustFrequency: 0.16,
    turbulence: 0.3,
  },
  strongWind: {
    enabled: true,
    strength: 1.15,
    speed: 1.25,
    gustStrength: 0.45,
    gustFrequency: 0.2,
    turbulence: 0.55,
  },
  storm: {
    enabled: true,
    strength: 1.6,
    speed: 1.55,
    gustStrength: 0.65,
    gustFrequency: 0.28,
    turbulence: 0.85,
  },
};

function directionFromDegrees(degrees: number) {
  const radians = THREE.MathUtils.degToRad(degrees);
  return new THREE.Vector2(Math.cos(radians), Math.sin(radians)).normalize();
}

export const DEFAULT_ENVIRONMENT_STATE: EnvironmentState = {
  wind: {
    ...ENVIRONMENT_WIND_PRESETS.windy,
    direction: directionFromDegrees(DEFAULT_DIRECTION_DEGREES),
  },
};

function cloneWindState(wind: EnvironmentWindState): EnvironmentWindState {
  return { ...wind, direction: wind.direction.clone() };
}

export function getWindDirectionDegrees(direction: THREE.Vector2) {
  const degrees = THREE.MathUtils.radToDeg(Math.atan2(direction.y, direction.x));
  return (degrees + 360) % 360;
}

export class EnvironmentController {
  readonly windUniforms: GlobalWindUniforms;
  private wind: EnvironmentWindState;
  private gustPhase = 0;

  constructor(initialState: EnvironmentState = DEFAULT_ENVIRONMENT_STATE) {
    this.wind = cloneWindState(initialState.wind);
    this.windUniforms = {
      uWindTime: { value: 0 },
      uWindDirection: { value: this.wind.direction.clone() },
      uWindStrength: { value: 0 },
      uWindSpeed: { value: 1 },
      uWindGust: { value: 0 },
      uWindTurbulence: { value: 0 },
    };
    this.syncUniforms();
  }

  getState(): EnvironmentState {
    return { wind: cloneWindState(this.wind) };
  }

  setWind(patch: Partial<EnvironmentWindState>) {
    this.wind = {
      ...this.wind,
      ...patch,
      direction: (patch.direction ?? this.wind.direction).clone().normalize(),
    };
    if (this.wind.direction.lengthSq() === 0) this.wind.direction.set(1, 0);
    this.syncUniforms();
  }

  setWindDirectionDegrees(degrees: number) {
    this.setWind({ direction: directionFromDegrees(degrees) });
  }

  applyWindPreset(preset: EnvironmentWindPreset) {
    this.setWind(ENVIRONMENT_WIND_PRESETS[preset]);
  }

  update(delta: number) {
    const safeDelta = Math.min(Math.max(delta, 0), 0.1);
    this.windUniforms.uWindTime.value += safeDelta;
    this.gustPhase += safeDelta * this.wind.gustFrequency * Math.PI * 2;

    const wave = 0.5 + Math.sin(this.gustPhase) * 0.5;
    const gustEnvelope = THREE.MathUtils.smoothstep(wave, 0.52, 0.96);
    this.windUniforms.uWindGust.value = this.wind.enabled
      ? gustEnvelope * this.wind.gustStrength
      : 0;
  }

  private syncUniforms() {
    this.windUniforms.uWindDirection.value.copy(this.wind.direction);
    this.windUniforms.uWindStrength.value = this.wind.enabled ? this.wind.strength : 0;
    this.windUniforms.uWindSpeed.value = this.wind.speed;
    this.windUniforms.uWindTurbulence.value = this.wind.enabled ? this.wind.turbulence : 0;
    if (!this.wind.enabled || this.wind.gustStrength === 0) this.windUniforms.uWindGust.value = 0;
  }
}
