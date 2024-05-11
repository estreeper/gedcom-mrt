import React, { useState } from 'react';
import logo from './logo.svg';
import './App.css';
import { parse } from './Parser';

function App() {
  const [db1Text, setdb1Text] = useState();
  return (
    <div className="App">
      <header className="App-header">
        <input type="file" onChange={(input) => {
          if (input && input.target && input.target.files) {
            parse(input.target.files[0]);
          }
        }} />
      </header>
    </div>
  );
}

export default App;
