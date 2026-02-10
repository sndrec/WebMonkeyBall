import type { LoadedPack } from '../../pack.js';

type PackLoaderOptions = {
  loadPackFromUrl: (url: string) => Promise<LoadedPack>;
  loadPackFromZipFile: (file: File) => Promise<LoadedPack>;
  loadPackFromFileList: (files: FileList) => Promise<LoadedPack>;
  applyLoadedPack: (pack: LoadedPack) => Promise<void>;
  setHudStatus: (message: string) => void;
};

type PackPickerBindingsOptions = {
  packPicker: HTMLElement | null;
  packLoadButton: HTMLButtonElement | null;
  packLoadZipButton: HTMLButtonElement | null;
  packLoadFolderButton: HTMLButtonElement | null;
  packFileInput: HTMLInputElement | null;
  packFolderInput: HTMLInputElement | null;
};

export class PackLoader {
  private readonly loadPackFromUrl: PackLoaderOptions['loadPackFromUrl'];
  private readonly loadPackFromZipFile: PackLoaderOptions['loadPackFromZipFile'];
  private readonly loadPackFromFileList: PackLoaderOptions['loadPackFromFileList'];
  private readonly applyLoadedPack: PackLoaderOptions['applyLoadedPack'];
  private readonly setHudStatus: PackLoaderOptions['setHudStatus'];

  constructor(options: PackLoaderOptions) {
    this.loadPackFromUrl = options.loadPackFromUrl;
    this.loadPackFromZipFile = options.loadPackFromZipFile;
    this.loadPackFromFileList = options.loadPackFromFileList;
    this.applyLoadedPack = options.applyLoadedPack;
    this.setHudStatus = options.setHudStatus;
  }

  async initFromQuery() {
    const packParam = new URLSearchParams(window.location.search).get('pack');
    if (!packParam) {
      return;
    }
    try {
      const pack = await this.loadPackFromUrl(packParam);
      await this.applyLoadedPack(pack);
    } catch (error) {
      console.error(error);
      this.setHudStatus('Failed to load pack.');
    }
  }

  bindPickerUi(options: PackPickerBindingsOptions) {
    const setPackPickerOpen = (open: boolean) => {
      if (!options.packPicker) {
        return;
      }
      options.packPicker.classList.toggle('hidden', !open);
    };

    options.packLoadButton?.addEventListener('click', () => {
      if (!options.packPicker) {
        return;
      }
      setPackPickerOpen(options.packPicker.classList.contains('hidden'));
    });

    options.packLoadZipButton?.addEventListener('click', () => {
      setPackPickerOpen(false);
      options.packFileInput?.click();
    });

    options.packLoadFolderButton?.addEventListener('click', () => {
      setPackPickerOpen(false);
      options.packFolderInput?.click();
    });

    options.packFileInput?.addEventListener('change', async () => {
      const file = options.packFileInput?.files?.[0];
      if (options.packFileInput) {
        options.packFileInput.value = '';
      }
      if (!file) {
        return;
      }
      try {
        const pack = await this.loadPackFromZipFile(file);
        await this.applyLoadedPack(pack);
      } catch (error) {
        console.error(error);
        this.setHudStatus('Failed to load pack.');
      }
    });

    options.packFolderInput?.addEventListener('change', async () => {
      const files = options.packFolderInput?.files;
      if (options.packFolderInput) {
        options.packFolderInput.value = '';
      }
      if (!files || files.length === 0) {
        return;
      }
      try {
        const pack = await this.loadPackFromFileList(files);
        await this.applyLoadedPack(pack);
      } catch (error) {
        console.error(error);
        this.setHudStatus('Failed to load pack.');
      }
    });
  }
}
