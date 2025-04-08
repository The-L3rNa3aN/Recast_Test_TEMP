import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils";
import * as RecastNavigation from "recast-navigation";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import Player from "./Player";

//#region Basic Setup
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
const mainCam = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const gltfLoader = new GLTFLoader();
const clock = new THREE.Clock();
const controls = new OrbitControls(mainCam, renderer.domElement);

mainCam.position.set(10, 20, 10);
mainCam.lookAt(0, 0, 0);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMappingExposure = 2.3;
renderer.gammaFactor = 0;
renderer.outputEncoding = THREE.sRGBEncoding;

let dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(0, 5, 5);
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
dirLight.castShadow = true;

scene.add(dirLight);

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.render(scene, mainCam);
document.body.appendChild(renderer.domElement);

window.addEventListener("resize", () =>
{
    mainCam.aspect = window.innerWidth / window.innerHeight;
    mainCam.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const gravity = { x: 0, y: -9.81, z: 0 };
const physWorld = new RAPIER.World(gravity);
//#endregion

//#region Model to Scene
function createMesh(meshes)
{
    //Definitely my code. https://discourse.threejs.org/t/importing-glb-file-every-material-is-single-mesh/16227/2
    var materials = [],
    geometries = [],
    mergedGeometry = new THREE.BufferGeometry(),
    meshMaterial,
    mergedMesh;

    meshes.forEach(function(mesh)
    {
        mesh.updateMatrix();
        geometries.push(mesh.geometry);
        meshMaterial = new THREE.MeshStandardMaterial(mesh.material);
        materials.push(meshMaterial);
    });

    mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, true);
    mergedGeometry.groupsNeedUpdate = true;

    mergedMesh = new THREE.Mesh(mergedGeometry, materials);
    mergedMesh.castShadow = true;
    mergedMesh.receiveShadow = true;

    return mergedMesh;
}

function resolveModel(url)
{
    return new Promise((resolve) =>
    {
        gltfLoader.load(url, (gltf) => resolve(gltf));
    });
}

async function loadModel()
{
    let gltf = await resolveModel("./Maps/testMap_2.glb");
    let _mesh = createMesh(gltf.scene.children[0].children);
    let vertices = _mesh.geometry.attributes.position.array;
    let indices = _mesh.geometry.index.array;
    let meshCollider = RAPIER.ColliderDesc.trimesh(vertices, indices);
    physWorld.createCollider(meshCollider);
    _mesh.tag = "";
    return _mesh;
}

let _map = await loadModel();
console.log(_map);
scene.add(_map);
//#endregion

RecastNavigation.init();

//#region Navmesh Generation
let navmesh; /* let groupID; let navpath; let ZONE = "testScene";
gltfLoader.load("./Maps/navMesh_testMap_2.gltf", (gltf) =>
{
    gltf.scene.traverse((node) =>
    {
        if(!navmesh && node.isObject3D && node.children && node.children.length > 0)
        {
            navmesh = node.children[0];
        }
    });
}); */

async function loadNavMeshFromGLB(url)
{
    let gltf = await resolveModel(url);
    let g = extractGeometry(gltf.scene);
    let n = buildNavMesh(g);
    return n;
}

function extractGeometry(s)
{
    // Extract vertices and indices from the scene
    let vertices = [];
    let indices = [];
    s.traverse((child) =>
    {
        if (child.isMesh)
        {
            let position = child.geometry.attributes.position.array;
            let index = child.geometry.index.array;
            vertices.push(...position);
            indices.push(...index);
        }
    });

    return { vertices, indices };
}

function buildNavMesh({ vertices, indices })
{
    let n = new RecastNavigation.NavMesh();
    let config = new RecastNavigation.NavMeshConfig();
    n.build(vertices, indices, config);
    return n;
}

navmesh = await loadNavMeshFromGLB("./Maps/navMesh_testMap_2.gltf");
console.log(navmesh);
//#endregion

const player = new Player(physWorld, scene, { x: 6, y: 1.5, z: 6 });

//#region Update loop
function updateLoop(timestamp)
{
    requestAnimationFrame(updateLoop);

    const delta = clock.getDelta();

    physWorld.step();

    player.update(delta);

    renderer.render(scene, mainCam);
}
//#endregion

requestAnimationFrame(updateLoop);
