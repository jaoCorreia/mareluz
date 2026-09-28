import { Quaternion, Vector3 } from 'three';

export function segmentIntersectsEllipse(a, b, ellipse) {
  if (ellipse.radiusX <= 0 || ellipse.radiusY <= 0) return false;
  const x = (a.x - ellipse.x) / ellipse.radiusX;
  const y = (a.y - ellipse.y) / ellipse.radiusY;
  const dx = (b.x - a.x) / ellipse.radiusX;
  const dy = (b.y - a.y) / ellipse.radiusY;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, -(x * dx + y * dy) / length)) : 0;
  return (x + t * dx) ** 2 + (y + t * dy) ** 2 <= 1;
}

// Intersect the aim ray with a sphere around the hilt. The rigid blade's tip
// then lands exactly on the same screen coordinates used by hit detection.
export function saberPose(point, fov, aspect) {
  const hilt = new Vector3(.42, -.6, -1.1);
  const tangent = Math.tan(fov * Math.PI / 360);
  const ray = new Vector3((point.x * 2 - 1) * aspect * tangent, (1 - point.y * 2) * tangent, -1).normalize();
  const length = 2.02;
  const projection = ray.dot(hilt);
  const distance = projection + Math.sqrt(projection * projection + length * length - hilt.lengthSq());
  const tip = ray.multiplyScalar(distance);
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tip.clone().sub(hilt).normalize());
  return { position: hilt, rotation, tip };
}
