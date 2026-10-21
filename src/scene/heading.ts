/**
 * Maps the sim heading to the Three.js body rotation.
 *
 * The body mesh is modeled with its nose on local -Z. The sim moves along
 * (sin yaw, cos yaw), i.e. +Z at yaw 0, so the mesh is turned half a turn.
 */
export function bodyRotationY(yaw: number): number {
  return yaw + Math.PI;
}
