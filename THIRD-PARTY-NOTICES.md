# Third-party notices

This application bundles open-source software. All dependencies are distributed
under permissive licenses (MIT, ISC, Apache-2.0) that allow free use,
modification and redistribution, including in commercial contexts, at no cost.

Full license texts are available in each package's directory under
`node_modules/<package>/` and in the projects' repositories.

## Direct dependencies

| Package | License |
| --- | --- |
| [simple-git](https://github.com/steveukx/git-js) | MIT |
| [electron](https://github.com/electron/electron) | MIT |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT |
| [electron-vite](https://github.com/alex8088/electron-vite) | MIT |
| [react](https://github.com/facebook/react) | MIT |
| [react-dom](https://github.com/facebook/react) | MIT |
| [zustand](https://github.com/pmndrs/zustand) | MIT |
| [lucide-react](https://github.com/lucide-icons/lucide) | ISC |
| [tailwindcss](https://github.com/tailwindlabs/tailwindcss) | MIT |
| [postcss](https://github.com/postcss/postcss) | MIT |
| [autoprefixer](https://github.com/postcss/autoprefixer) | MIT |
| [vite](https://github.com/vitejs/vite) | MIT |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | MIT |
| [typescript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT |
| [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT |
| [@types/react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT |

Transitive dependencies pulled in by the packages above are likewise licensed
under permissive terms (predominantly MIT/ISC/BSD/Apache-2.0).

## Runtime components

Electron embeds **Chromium** (BSD-3-Clause and other permissive licenses) and
**Node.js** (MIT). This app performs no audio/video playback, so it does not
rely on the optional proprietary media codecs that Chromium can include.
