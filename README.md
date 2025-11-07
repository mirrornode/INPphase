# INPphase

## Reorganizing Old Transient Adaptations Neurologically

React frontend for visualizing dynamical system data from a Python WebSocket backend.

## Setup

1. Install dependencies:

    ```bash
    npm install
    # or
    yarn install
    ```

1. Start the development server:

    ```bash
    npm run dev
    # or
    yarn dev
    ```

## WebSocket Protocol

The frontend communicates with the Python backend using WebSocket messages in JSON format.

### Message Types

#### Frontend → Backend

1. Configuration:
```json
{
  "type": "config",
  "payload": {
    "sampleRate": 50,
    "bufferSize": 400,
    "poincarePoints": 200
  }
}
```

2. Commands:
```json
{
  "type": "command",
  "payload": {
    "action": "reset"
  }
}
```

3. Disconnect:
```json
{
  "type": "disconnect",
  "payload": {
    "reason": "user_initiated"
  }
}
```

#### Backend → Frontend

1. State Update:
```json
{
  "type": "state",
  "payload": {
    "tau": number,
    "phi": number,
    "energy": number,
    "field": [number, number, number],
    "velocities": [number, number, number]
  }
}
```

2. Phase Data:
```json
{
  "type": "phase",
  "payload": {
    "tau": number,
    "x0": number,
    "v0": number,
    "x1": number,
    "v1": number,
    "x2": number,
    "v2": number
  }
}
```

3. Poincaré Data:
```json
{
  "type": "poincare",
  "payload": {
    "x": number,
    "v": number
  }
}
```

4. Spectrum Data:
```json
{
  "type": "spectrum",
  "payload": [{
    "freq": number,
    "magnitude": number,
    "db": number
  }]
}
```

5. Error:
```json
{
  "type": "error",
  "payload": {
    "message": string
  }
}
```

## Component Usage

Import and use the `RotanBridge` component in your React application:

```jsx
import RotanBridge from './components/RotanBridge';

function App() {
  return (
    <div>
      <RotanBridge />
    </div>
  );
}
```

The component handles WebSocket connection management, data visualization, and system state automatically. Make sure your Python backend is running on `ws://localhost:8765` before connecting.

## Features

- Real-time visualization of dynamical system data
- Phase space trajectories
- Poincaré sections
- Frequency spectrum analysis
- Protocol logging
- Automatic reconnection
- Graceful error handling
