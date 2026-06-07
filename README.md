# golf-ball-simulator
<img width="1274" height="725" alt="Screenshot 2026-06-07 023002" src="https://github.com/user-attachments/assets/9b915a58-1a31-422f-a48c-b56aec9c46a1" />

This project is a physically accurate golf‑ball simulation that models real‑world ball flight and kinematics. It includes an interactive control panel where you can adjust launch parameters such as swing speed, launch angle, backspin, sidespin, and environmental factors like wind speed and direction.

After running a simulation, the system provides a replay mode with video‑style controls that let you review specific moments of the ball’s trajectory , as the specific statistics are saved for all the trail . A visual trail renderer highlights the full flight path, and a detailed flight statistics panel updates key metrics every second, including carry distance, height, lateral deviation, and more.
## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation
in your VScode terminal -or any bash terminal-  
navigate to the distination you want to clone this project to then run the following bash commands :

1. **Clone the repository**
   ```bash
   git clone https://github.com/shahdalkhawam/golf-ball-simulator.git
   cd golf-ball-simulator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173` (or the URL shown in your terminal)

### Building for Production

To create a production build:
```bash
npm run build
```

To preview the production build locally:
```bash
npm run preview
```

## Technologies Used
- **Three.js** - 3D graphics and rendering
- **Vite** - Frontend build tool and dev server
- **lil-gui** - GUI for interactive controls
