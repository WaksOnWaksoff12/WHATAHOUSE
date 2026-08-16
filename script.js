/* =============================================================
   DIGITAL TWIN BUILDING MONITOR — script.js
   CE Project 1 Prototype

   Progress so far:
     [x] Scene / camera / renderer                  (Stage 1)
     [x] Lighting                                    (Stage 1)
     [x] OrbitControls (rotate / pan / zoom)          (Stage 1)
     [x] 6 m x 6 m building built from separate,
         named meshes                                (Stage 1)
     [x] Raycasting / component selection             (Stage 2)
     [x] Highlight effect on selection                (Stage 2)
     [x] Information panel                            (Stage 3)
     [ ] Measurement line visualization        <-- Stage 4
     [ ] UI polish                             <-- Stage 4

   STAGE 3 (this update) wires the right-side information panel to
   whatever is selected. With nothing selected, it shows the overall
   building overview. Once a component is clicked, it displays that
   component's name and every field in its `data` object — read
   directly from mesh.userData.componentData, not hardcoded per type.
============================================================= */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* -------------------------------------------------------------
   1. SAMPLE BUILDING DATA
   -------------------------------------------------------------
   This is placeholder / sample data for the CE Project 1 prototype.
   Every measurement here is made up (but realistic) — nothing is
   coming from a real scan yet.

   In CE Project 2, this array will be replaced by data produced by
   a Python/Open3D backend after processing an RTAB-Map 3D scan.
   As long as the replacement data follows the same shape (id, type,
   name, dimensions, position, rotation), none of the mesh-building
   code below needs to change. That is the whole point of keeping
   this list separate from the Three.js code.
------------------------------------------------------------- */

// Overall building dimensions, used both for geometry and for the
// future "nothing selected" view of the information panel (Stage 2).
const BUILDING_OVERVIEW = {
  buildingType: "Prototype Prefabricated House",
  overallWidth: 6.0, // meters, along X axis
  overallLength: 6.0, // meters, along Z axis
  wallHeight: 3.0, // meters
};

const WALL_THICKNESS = 0.15; // meters

// Half-extents, used repeatedly when placing components.
const HALF_WIDTH = BUILDING_OVERVIEW.overallWidth / 2; // 3.0
const HALF_LENGTH = BUILDING_OVERVIEW.overallLength / 2; // 3.0
const HALF_THICKNESS = WALL_THICKNESS / 2; // 0.075

// Each entry below fully describes ONE building component:
//   id       -> unique string, will be used for lookups later
//   type     -> "floor" | "wall" | "roof" | "door" | "window"
//   name     -> human-readable label shown in the future info panel
//   size     -> { x, y, z } box dimensions in meters
//   position -> { x, y, z } center of the box in world space
//   data     -> the measurement fields Stage 2's info panel will read
const SAMPLE_BUILDING_DATA = [
  {
    id: "floor",
    type: "floor",
    name: "Floor Slab",
    size: { x: BUILDING_OVERVIEW.overallWidth, y: 0.1, z: BUILDING_OVERVIEW.overallLength },
    position: { x: 0, y: -0.05, z: 0 },
    data: {
      length: BUILDING_OVERVIEW.overallLength,
      width: BUILDING_OVERVIEW.overallWidth,
      area: BUILDING_OVERVIEW.overallLength * BUILDING_OVERVIEW.overallWidth,
    },
  },
  {
    id: "north-wall",
    type: "wall",
    name: "North Wall",
    size: { x: BUILDING_OVERVIEW.overallWidth, y: BUILDING_OVERVIEW.wallHeight, z: WALL_THICKNESS },
    position: { x: 0, y: BUILDING_OVERVIEW.wallHeight / 2, z: -HALF_LENGTH + HALF_THICKNESS },
    data: {
      length: BUILDING_OVERVIEW.overallWidth,
      height: BUILDING_OVERVIEW.wallHeight,
      thickness: WALL_THICKNESS,
      area: BUILDING_OVERVIEW.overallWidth * BUILDING_OVERVIEW.wallHeight,
    },
  },
  {
    id: "south-wall",
    type: "wall",
    name: "South Wall",
    size: { x: BUILDING_OVERVIEW.overallWidth, y: BUILDING_OVERVIEW.wallHeight, z: WALL_THICKNESS },
    position: { x: 0, y: BUILDING_OVERVIEW.wallHeight / 2, z: HALF_LENGTH - HALF_THICKNESS },
    data: {
      length: BUILDING_OVERVIEW.overallWidth,
      height: BUILDING_OVERVIEW.wallHeight,
      thickness: WALL_THICKNESS,
      area: BUILDING_OVERVIEW.overallWidth * BUILDING_OVERVIEW.wallHeight,
    },
  },
  {
    id: "east-wall",
    type: "wall",
    name: "East Wall",
    size: { x: WALL_THICKNESS, y: BUILDING_OVERVIEW.wallHeight, z: BUILDING_OVERVIEW.overallLength },
    position: { x: HALF_WIDTH - HALF_THICKNESS, y: BUILDING_OVERVIEW.wallHeight / 2, z: 0 },
    data: {
      length: BUILDING_OVERVIEW.overallLength,
      height: BUILDING_OVERVIEW.wallHeight,
      thickness: WALL_THICKNESS,
      area: BUILDING_OVERVIEW.overallLength * BUILDING_OVERVIEW.wallHeight,
    },
  },
  {
    id: "west-wall",
    type: "wall",
    name: "West Wall",
    size: { x: WALL_THICKNESS, y: BUILDING_OVERVIEW.wallHeight, z: BUILDING_OVERVIEW.overallLength },
    position: { x: -HALF_WIDTH + HALF_THICKNESS, y: BUILDING_OVERVIEW.wallHeight / 2, z: 0 },
    data: {
      length: BUILDING_OVERVIEW.overallLength,
      height: BUILDING_OVERVIEW.wallHeight,
      thickness: WALL_THICKNESS,
      area: BUILDING_OVERVIEW.overallLength * BUILDING_OVERVIEW.wallHeight,
    },
  },
  {
    id: "roof",
    type: "roof",
    name: "Roof Slab",
    // Slightly larger than the footprint so it overhangs the walls a little, like a real eave.
    size: { x: BUILDING_OVERVIEW.overallWidth + 0.3, y: 0.2, z: BUILDING_OVERVIEW.overallLength + 0.3 },
    position: { x: 0, y: BUILDING_OVERVIEW.wallHeight + 0.1, z: 0 },
    data: {
      length: BUILDING_OVERVIEW.overallLength,
      width: BUILDING_OVERVIEW.overallWidth,
      area: BUILDING_OVERVIEW.overallLength * BUILDING_OVERVIEW.overallWidth,
    },
  },
  {
    id: "front-door",
    type: "door",
    name: "Front Door",
    size: { x: 1.0, y: 2.1, z: WALL_THICKNESS + 0.03 },
    // Set into the south wall, offset toward one side.
    position: { x: -1.5, y: 2.1 / 2, z: HALF_LENGTH - HALF_THICKNESS },
    data: {
      width: 1.0,
      height: 2.1,
      area: 1.0 * 2.1,
    },
  },
  {
    id: "window-east",
    type: "window",
    name: "East Window",
    size: { x: WALL_THICKNESS + 0.03, y: 1.2, z: 1.2 },
    // Sill height 0.9 m, so the window's vertical center sits at 0.9 + 1.2/2 = 1.5 m.
    position: { x: HALF_WIDTH - HALF_THICKNESS, y: 1.5, z: 0 },
    data: {
      width: 1.2,
      height: 1.2,
      area: 1.2 * 1.2,
    },
  },
  {
    id: "window-west",
    type: "window",
    name: "West Window",
    size: { x: WALL_THICKNESS + 0.03, y: 1.2, z: 1.2 },
    position: { x: -HALF_WIDTH + HALF_THICKNESS, y: 1.5, z: 0 },
    data: {
      width: 1.2,
      height: 1.2,
      area: 1.2 * 1.2,
    },
  },
];

/* -------------------------------------------------------------
   2. MATERIALS
   -------------------------------------------------------------
   One material per component type, so the building reads clearly
   at a glance (walls vs. roof vs. openings). Kept in one place so
   Stage 2 can reuse these same materials when un-highlighting a
   component (i.e. "restore to this original material").
------------------------------------------------------------- */
const MATERIALS = {
  floor: new THREE.MeshStandardMaterial({ color: 0x3a4256, roughness: 0.9, metalness: 0.05 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x2c3852, roughness: 0.85, metalness: 0.05 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x1c2438, roughness: 0.8, metalness: 0.1 }),
  door: new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.6, metalness: 0.1 }),
  window: new THREE.MeshStandardMaterial({
    color: 0x4fd1c5,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.55,
  }),
};

/* -------------------------------------------------------------
   3. SCENE / CAMERA / RENDERER
------------------------------------------------------------- */

const viewportElement = document.getElementById("viewport");
const canvasElement = document.getElementById("scene-canvas");

// The scene is the container that holds every 3D object.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 18, 40); // subtle depth fade, matches the dark theme

// The camera defines what we see. 50deg field of view feels natural for an
// architectural walkthrough (not too wide/fisheye, not too flat/telephoto).
const camera = new THREE.PerspectiveCamera(
  50,
  viewportElement.clientWidth / viewportElement.clientHeight,
  0.1,
  1000
);
// Start from a three-quarter / isometric-style angle, a good default view
// for showing off a whole small building at once.
camera.position.set(9, 7, 9);

// The renderer draws the scene + camera onto our canvas every frame.
const renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
renderer.setSize(viewportElement.clientWidth, viewportElement.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* -------------------------------------------------------------
   4. ORBIT CONTROLS
   -------------------------------------------------------------
   Lets the user rotate (left-drag), pan (right-drag / two-finger),
   and zoom (scroll / pinch) around the building.
------------------------------------------------------------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0); // look roughly at the building's mid-height, not the ground
controls.enableDamping = true; // smooth, "weighted" camera movement
controls.dampingFactor = 0.08;
controls.minDistance = 3; // don't let the user zoom inside the walls
controls.maxDistance = 25; // don't let the building shrink to a speck
controls.maxPolarAngle = Math.PI / 2 - 0.02; // stop the camera just short of going underground
controls.update();

/* -------------------------------------------------------------
   5. LIGHTING
   -------------------------------------------------------------
   A three-point-ish setup: a soft sky/ground fill plus one strong
   "sun" light that casts shadows, so the building has real shape
   and depth instead of looking flat.
------------------------------------------------------------- */

// Soft light from the "sky" (bluish) and "ground" (dark) — fills in shadows gently.
const hemisphereLight = new THREE.HemisphereLight(0x9fb8ff, 0x1a1f2e, 0.6);
scene.add(hemisphereLight);

// Low-level ambient light so no surface is ever fully black.
const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambientLight);

// Main directional "sun" light, casts shadows.
const sunLight = new THREE.DirectionalLight(0xfff2e0, 1.4);
sunLight.position.set(10, 14, 8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 40;
sunLight.shadow.camera.left = -10;
sunLight.shadow.camera.right = 10;
sunLight.shadow.camera.top = 10;
sunLight.shadow.camera.bottom = -10;
sunLight.shadow.bias = -0.0015;
scene.add(sunLight);

/* -------------------------------------------------------------
   6. BUILD THE BUILDING FROM SAMPLE_BUILDING_DATA
   -------------------------------------------------------------
   createComponentMesh() turns ONE data entry into ONE Three.js
   mesh. Because every component is its own mesh (not merged into
   one big shape), Stage 2 will be able to raycast and highlight
   them individually.
------------------------------------------------------------- */

// This group holds every building component, so we can move / show / hide
// the whole building at once later if needed.
const buildingGroup = new THREE.Group();
buildingGroup.name = "building";
scene.add(buildingGroup);

// Keep a flat list of the meshes we create. Stage 2's raycaster will loop
// over this array to test for clicks, instead of walking the whole scene.
const selectableComponents = [];

function createComponentMesh(componentSpec) {
  const geometry = new THREE.BoxGeometry(
    componentSpec.size.x,
    componentSpec.size.y,
    componentSpec.size.z
  );

  // IMPORTANT: .clone() the shared material so each component gets its OWN
  // material instance. All walls start out looking identical (same color),
  // but because each one has its own material object, we can safely light
  // up ONE wall's emissive glow later without accidentally lighting up
  // every other wall that shares the same base material.
  const material = MATERIALS[componentSpec.type].clone();
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(
    componentSpec.position.x,
    componentSpec.position.y,
    componentSpec.position.z
  );

  mesh.name = componentSpec.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Store the component's data on the mesh itself. The Stage 3 info panel
  // will read `mesh.userData.componentData` once a component is clicked.
  mesh.userData.componentData = {
    id: componentSpec.id,
    type: componentSpec.type,
    name: componentSpec.name,
    ...componentSpec.data,
  };

  // Remember this mesh's "resting" (non-highlighted) emissive glow so the
  // highlight function can restore it exactly when the component is
  // deselected, instead of guessing a default value.
  mesh.userData.restingEmissive = material.emissive.clone();
  mesh.userData.restingEmissiveIntensity = material.emissiveIntensity;

  return mesh;
}

// Build every component described in SAMPLE_BUILDING_DATA.
SAMPLE_BUILDING_DATA.forEach((componentSpec) => {
  const mesh = createComponentMesh(componentSpec);
  buildingGroup.add(mesh);
  selectableComponents.push(mesh);
});

/* -------------------------------------------------------------
   7. GROUND GRID (for scale reference only, not part of the building)
------------------------------------------------------------- */
const groundGrid = new THREE.GridHelper(20, 20, 0x2c3852, 0x18213a);
groundGrid.position.y = -0.11; // just below the floor slab so it doesn't z-fight
scene.add(groundGrid);

/* -------------------------------------------------------------
   8. RESPONSIVE RESIZE
   -------------------------------------------------------------
   Keeps the render resolution and camera aspect ratio matched to
   the viewport element's actual on-screen size.
------------------------------------------------------------- */
function handleResize() {
  const width = viewportElement.clientWidth;
  const height = viewportElement.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
}
window.addEventListener("resize", handleResize);

/* -------------------------------------------------------------
   9. RENDER LOOP
------------------------------------------------------------- */
function animate() {
  requestAnimationFrame(animate);

  controls.update(); // required every frame because enableDamping is true

  renderer.render(scene, camera);
}
animate();

/* =============================================================
   10. COMPONENT SELECTION (Stage 2)
   -------------------------------------------------------------
   How this works, in order:

   1. When the user presses AND releases the mouse in roughly the
      same spot (a "click", not a camera-rotate drag), we convert
      that screen position into normalized device coordinates
      (-1 to +1 on each axis).
   2. THREE.Raycaster shoots an invisible ray from the camera,
      through that screen point, into the 3D scene.
   3. raycaster.intersectObjects() tells us every component mesh
      that ray passed through, ordered nearest-first. The nearest
      one is what the user actually clicked on.
   4. We highlight that mesh and remove the highlight from whatever
      was previously selected.
============================================================= */

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(); // pointer position in Normalized Device Coordinates

// Colors used purely for the highlight effect (not stored as component data).
const HIGHLIGHT_EMISSIVE = new THREE.Color(0xf2a65a); // warm amber glow
const HIGHLIGHT_OUTLINE_COLOR = 0xf2a65a;

let selectedMesh = null; // the currently selected component, or null if none
let highlightOutline = null; // the wireframe box drawn around the selected component

/**
 * Applies the highlight look (emissive glow) to a mesh.
 */
function applyHighlight(mesh) {
  mesh.material.emissive.set(HIGHLIGHT_EMISSIVE);
  mesh.material.emissiveIntensity = 0.85;
}

/**
 * Restores a mesh's material to the way it looked before it was selected.
 */
function removeHighlight(mesh) {
  mesh.material.emissive.copy(mesh.userData.restingEmissive);
  mesh.material.emissiveIntensity = mesh.userData.restingEmissiveIntensity;
}

/**
 * Selects a new component: un-highlights the previous selection (if any),
 * highlights the new one, and draws a wireframe outline box around it so
 * the selection is clearly visible from any camera angle.
 */
function selectComponent(mesh) {
  if (selectedMesh === mesh) return; // already selected, nothing to do

  clearSelection();

  selectedMesh = mesh;
  applyHighlight(mesh);

  // BoxHelper draws a wireframe box that exactly matches the mesh's
  // current bounding box — an easy, reliable way to frame the selection.
  highlightOutline = new THREE.BoxHelper(mesh, HIGHLIGHT_OUTLINE_COLOR);
  scene.add(highlightOutline);

  // Update the right-side info panel with this component's data.
  showComponentInfo(mesh.userData.componentData);
}

/**
 * Deselects whatever is currently selected (used when the user clicks
 * empty space, or right before selecting something new).
 */
function clearSelection() {
  if (selectedMesh) {
    removeHighlight(selectedMesh);
    selectedMesh = null;
  }
  if (highlightOutline) {
    scene.remove(highlightOutline);
    highlightOutline.dispose();
    highlightOutline = null;
  }

  // With nothing selected, the panel falls back to the building overview.
  showBuildingOverview();
}

/**
 * Runs the actual raycast at a given screen position (in CSS pixels,
 * e.g. from a mouse event's clientX/clientY) and selects whatever
 * building component is under that point, if any.
 */
function pickComponentAtScreenPosition(clientX, clientY) {
  const canvasBounds = canvasElement.getBoundingClientRect();

  // Convert screen pixel coordinates to Normalized Device Coordinates,
  // where (0,0) is the center of the canvas, (-1,-1) is bottom-left,
  // and (1,1) is top-right — the format THREE.Raycaster expects.
  pointerNDC.x = ((clientX - canvasBounds.left) / canvasBounds.width) * 2 - 1;
  pointerNDC.y = -((clientY - canvasBounds.top) / canvasBounds.height) * 2 + 1;

  raycaster.setFromCamera(pointerNDC, camera);

  // `false` = don't check descendants recursively; our meshes have none.
  const intersections = raycaster.intersectObjects(selectableComponents, false);

  if (intersections.length > 0) {
    const closestHit = intersections[0]; // nearest object along the ray
    selectComponent(closestHit.object);
  } else {
    clearSelection(); // clicked empty space (or the sky) — deselect
  }
}

/* -------------------------------------------------------------
   Click detection: we distinguish a real "click" from a
   camera-rotate drag by checking how far the pointer moved
   between mousedown and mouseup. OrbitControls needs to keep
   receiving drag events uninterrupted, so we only ever READ
   pointer positions here — we never call preventDefault() or
   stopPropagation().
------------------------------------------------------------- */
const CLICK_DRAG_THRESHOLD_PX = 5; // movement below this = treated as a click
let pointerDownPosition = { x: 0, y: 0 };

canvasElement.addEventListener("pointerdown", (event) => {
  pointerDownPosition = { x: event.clientX, y: event.clientY };
});

canvasElement.addEventListener("pointerup", (event) => {
  const deltaX = event.clientX - pointerDownPosition.x;
  const deltaY = event.clientY - pointerDownPosition.y;
  const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (dragDistance < CLICK_DRAG_THRESHOLD_PX) {
    pickComponentAtScreenPosition(event.clientX, event.clientY);
  }
});

/* =============================================================
   11. INFORMATION PANEL (Stage 3)
   -------------------------------------------------------------
   Two views, both rendered into the same #panel-content element:

   - showBuildingOverview() : the default view, shown when nothing
     is selected. Its three fields come from BUILDING_OVERVIEW,
     the same overall-dimensions object used to build the geometry.

   - showComponentInfo(componentData) : shown after a click.
     IMPORTANT — this function does NOT know in advance whether it's
     describing a wall, a door, or a window. It just loops over
     whatever fields exist in the component's own `data` object
     (length, height, thickness, area, width...) and renders one
     row per field. That's what "data comes from the component's
     data object, not hardcoded per type" means in practice: add a
     new field to SAMPLE_BUILDING_DATA and it shows up here with no
     changes to this function.
============================================================= */

const panelEyebrow = document.getElementById("panel-eyebrow");
const panelTitle = document.getElementById("panel-title");
const panelContent = document.getElementById("panel-content");
const panelHint = document.getElementById("panel-hint");

// Fields we never want printed as a generic row, either because they're
// identifiers rather than measurements (id, type, name) or because the
// overview function already displays them by hand.
const NON_MEASUREMENT_FIELDS = ["id", "type", "name"];

/**
 * Turns a data object's key (e.g. "wallHeight") into a readable label
 * (e.g. "Wall Height"), by splitting camelCase words and capitalizing.
 */
function formatFieldLabel(fieldKey) {
  const withSpaces = fieldKey.replace(/([A-Z])/g, " $1"); // wallHeight -> wall Height
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1); // -> Wall Height
}

/**
 * Formats a numeric measurement with the right unit: square meters for
 * any field named/ending in "area", plain meters for everything else.
 */
function formatFieldValue(fieldKey, value) {
  if (typeof value !== "number") return String(value);
  const unit = fieldKey.toLowerCase().includes("area") ? "m\u00B2" : "m";
  return `${value.toFixed(2)} ${unit}`;
}

/**
 * Renders an array of { label, value } pairs into #panel-content.
 * Both the overview and the component view use this same renderer.
 */
function renderPanelRows(rows) {
  panelContent.innerHTML = ""; // clear whatever was shown before

  rows.forEach((row) => {
    const rowElement = document.createElement("div");
    rowElement.className = "panel-row";

    const labelElement = document.createElement("span");
    labelElement.className = "panel-row-label";
    labelElement.textContent = row.label;

    const valueElement = document.createElement("span");
    valueElement.className = "panel-row-value";
    valueElement.textContent = row.value;

    rowElement.appendChild(labelElement);
    rowElement.appendChild(valueElement);
    panelContent.appendChild(rowElement);
  });
}

/**
 * Default panel view: shown on page load and whenever nothing is selected.
 */
function showBuildingOverview() {
  panelEyebrow.textContent = "Overview";
  panelTitle.textContent = "Building Information";
  panelHint.textContent = "Click a building component to view its measurements.";

  renderPanelRows([
    { label: "Building Type", value: BUILDING_OVERVIEW.buildingType },
    {
      label: "Overall Dimensions",
      value: `${BUILDING_OVERVIEW.overallWidth.toFixed(2)} m \u00D7 ${BUILDING_OVERVIEW.overallLength.toFixed(2)} m`,
    },
    { label: "Wall Height", value: `${BUILDING_OVERVIEW.wallHeight.toFixed(2)} m` },
  ]);
}

/**
 * Component panel view: shown after a wall/floor/roof/door/window is clicked.
 * `componentData` is exactly mesh.userData.componentData — nothing here is
 * re-typed or hardcoded per component; it's read straight from that object.
 */
function showComponentInfo(componentData) {
  panelEyebrow.textContent = componentData.type.toUpperCase();
  panelTitle.textContent = componentData.name;
  panelHint.textContent = "Click another component, or click empty space to deselect.";

  const rows = Object.keys(componentData)
    .filter((fieldKey) => !NON_MEASUREMENT_FIELDS.includes(fieldKey))
    .map((fieldKey) => ({
      label: formatFieldLabel(fieldKey),
      value: formatFieldValue(fieldKey, componentData[fieldKey]),
    }));

  renderPanelRows(rows);
}

// Show the building overview immediately on page load, before anything
// has been clicked.
showBuildingOverview();

/* -------------------------------------------------------------
   STAGE 4 PREVIEW (not implemented yet):
   showComponentInfo() runs every time selectComponent() fires, which
   is exactly where Stage 4 will also trigger measurement line/label
   drawing around `selectedMesh`.
------------------------------------------------------------- */