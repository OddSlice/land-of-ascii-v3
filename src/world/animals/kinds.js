// The animals' kinds (phase 4b): what each is, its sizes and speeds, and the
// state every animal is drawn from. Sizes in metres (before an animal's own
// scale), speeds in metres a second; see docs/scale.md.
//
// A state is AS numbers (see A): where the animal is and its height (its
// feet's, or a bird's in the air), which way it faces, its pose and the
// phase of its gait or wingbeat, how far its head is up (an alert animal's
// head comes up from grazing), its kind, identity and scale, and the two
// materials of its coat.
import { MAT } from '../../contract.js';

export const AS = 16;
export const A = { X: 0, Z: 1, Y: 2, YAW: 3, POSE: 4, PHASE: 5, HEAD: 6, KIND: 7, ID: 8, SCALE: 9, WING: 10, M1: 11, M2: 12, ALERT: 13, ROOM: 14, SPARE: 15 };
export const APOSE = { STAND: 0, WALK: 1, RUN: 2, GRAZE: 3, LIE: 4, SIT: 5, PECK: 6, SWIM: 7, FLY: 8, PERCH: 9, HIDDEN: 10 };
export const KIND = { SHEEP: 0, COW: 1, HEN: 2, DOG: 3, DEER: 4, HARE: 5, DUCK: 6, GULL: 7, CROW: 8, FINCH: 9, KITE: 10 };
export const KIND_NAMES = ['sheep', 'cattle', 'hens', 'dogs', 'deer', 'hares', 'ducks', 'gulls', 'crows', 'small birds', 'large birds'];
// (a bird is drawn as one mark from its own glyph family past `mark` metres
// when in the air)
export const BIRDS = new Set([KIND.GULL, KIND.CROW, KIND.FINCH, KIND.KITE]);

// per kind: body radius (for meeting and the walking rules), length, height
// to its back, walking and running speed, the stride of a gait cycle
// (metres a cycle), alert and flight distances from a walker [alert, flight
// from, flight to] (flight grows from the first to the second), and how far
// it goes when it flees
export const SPEC = {
  [KIND.SHEEP]: { r: 0.35, len: 0.95, back: 0.86, walk: 1.0, run: 2.2, stride: 0.9, near: 2.2, coat: [MAT.WOOL, MAT.CHARCOAL] },
  [KIND.COW]:   { r: 0.55, len: 2.0, back: 1.35, walk: 0.9, run: 1.8, stride: 1.4, near: 2.6, coat: [MAT.HIDE, MAT.CHARCOAL] },
  [KIND.HEN]:   { r: 0.16, len: 0.35, back: 0.32, walk: 0.5, run: 1.6, stride: 0.25, near: 1.4, coat: [MAT.RUSSET, MAT.OCHRE] },
  [KIND.DOG]:   { r: 0.3, len: 0.85, back: 0.58, walk: 1.3, run: 3.5, stride: 0.8, near: 0, coat: [MAT.UMBER, MAT.CHARCOAL] },
  [KIND.DEER]:  { r: 0.45, len: 1.25, back: 1.2, walk: 1.1, run: 7.0, stride: 1.6, alert: 40, flight: [22, 13], flee: 45, coat: [MAT.FAWN, MAT.LINEN] },
  [KIND.HARE]:  { r: 0.2, len: 0.45, back: 0.3, walk: 0.6, run: 9.0, stride: 0.9, alert: 16, flight: [9, 5], flee: 32, coat: [MAT.HARE, MAT.LINEN] },
  [KIND.DUCK]:  { r: 0.22, len: 0.42, back: 0.18, walk: 0.35, run: 1.0, stride: 0.35, alert: 12, flight: [9, 5], flee: 8, coat: [MAT.DUCK, MAT.DUCKHEAD] },
  [KIND.GULL]:  { r: 0.2, len: 0.42, back: 0.3, walk: 0.5, run: 9.0, stride: 0.5, alert: 18, flight: [11, 7], flee: 0, span: 1.2, coat: [MAT.GULL, MAT.SLATE] },
  [KIND.CROW]:  { r: 0.18, len: 0.42, back: 0.3, walk: 0.5, run: 10.0, stride: 0.5, alert: 22, flight: [12, 8], flee: 0, span: 0.95, coat: [MAT.CROW, MAT.CHARCOAL] },
  [KIND.FINCH]: { r: 0.08, len: 0.14, back: 0.1, walk: 0.3, run: 11.0, stride: 0.2, span: 0.24, coat: [MAT.UMBER, MAT.OCHRE] },
  [KIND.KITE]:  { r: 0.4, len: 0.6, back: 0.4, walk: 0.5, run: 14.0, stride: 0.5, span: 1.8, coat: [MAT.UMBER, MAT.CHARCOAL] },
};

// the distance steps (as people's): all parts near, the legs merged within
// MID, a two-cell silhouette beyond
export const ANEAR_D = 14, AMID_D = 40;
