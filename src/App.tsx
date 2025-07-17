import '@/App.css';

import DownloadForm from './components/download-form';
import SettingsDialog from './components/settings-dialog';

function App() {
  return (
    <main className="flex h-dvh w-dvw flex-col p-4">
      <DownloadForm />
      <SettingsDialog />
    </main>
  );
}

export default App;
