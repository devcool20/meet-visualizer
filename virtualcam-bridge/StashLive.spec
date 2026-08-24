# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = ['speech_recognition', 'pyvirtualcam', 'PIL', 'cv2', 'requests', 'numpy', 'keyboard']

tmp_ret = collect_all('pyvirtualcam')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

tmp_ret = collect_all('speech_recognition')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

excluded_modules = [
    'torch', 'torchvision', 'torchaudio', 'onnxruntime', 'matplotlib', 
    'pandas', 'scipy', 'IPython', 'pytest', 'tkinter', 'nbformat', 
    'jupyter', 'tornado', 'zmq', 'sqlalchemy', 'openpyxl', 'pyarrow',
    'transformers', 'huggingface_hub', 'safetensors', 'accelerate'
]

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excluded_modules,
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='StashLive',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='StashLive',
)
