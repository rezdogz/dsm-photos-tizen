#!/usr/bin/env python3
"""Build the Tizen app (dist/dsm_photos.wgt) from src/.

  dsm_photos.wgt  - Synology Photos (Shared / Personal Space)   app id DsmPhotos0.DsmPhotos
Usage: python3 build.py
"""
import os, re, shutil, zipfile
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, DIST = os.path.join(HERE, 'src'), os.path.join(HERE, 'dist')

TARGETS = [
    dict(name='dsm_photos', wgt='dsm_photos.wgt', title='DSM Photos',
         package='DsmPhotos0', app='DsmPhotos', wid='DsmPhotos', version='1.6.0',
         frame=(31, 183, 140), hills=(94, 234, 212)),
]

CONFIG = '''<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://localhost/{wid}" version="{version}" viewmodes="maximized">
  <tizen:application id="{package}.{app}" package="{package}" required_version="5.0"/>
  <content src="index.html"/>
  <feature name="http://tizen.org/feature/screen.size.all"/>
  <icon src="icon.png"/>
  <name>{title}</name>
  <tizen:privilege name="http://tizen.org/privilege/internet"/>
  <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
  <tizen:privilege name="http://tizen.org/privilege/power"/>
  <access origin="*" subdomains="true"/>
  <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
</widget>
'''

def icon(path, frame, hills):
    S = 512
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=96, fill=(22, 27, 34, 255))
    d.rounded_rectangle((96, 120, 416, 392), radius=28, fill=frame + (255,))
    d.rounded_rectangle((116, 140, 396, 372), radius=14, fill=(13, 17, 23, 255))
    d.ellipse((300, 168, 356, 224), fill=(255, 214, 102, 255))
    d.polygon([(116, 372), (210, 240), (280, 320), (330, 270), (396, 372)], fill=hills + (255,))
    im.save(path)

def build(t):
    out = os.path.join(DIST, t['name'])
    if os.path.exists(out):
        shutil.rmtree(out)
    shutil.copytree(SRC, out)
    appjs = os.path.join(out, 'js', 'app.js')
    s = open(appjs).read()
    s, n = re.subn(r"var VERSION = '[0-9.]*';", "var VERSION = '%s';" % t['version'], s, count=1)
    assert n == 1, 'VERSION flag not found'
    open(appjs, 'w').write(s)
    open(os.path.join(out, 'config.xml'), 'w').write(CONFIG.format(**t))
    icon(os.path.join(out, 'icon.png'), t['frame'], t['hills'])
    wgt = os.path.join(DIST, t['wgt'])
    if os.path.exists(wgt):
        os.remove(wgt)
    with zipfile.ZipFile(wgt, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(out):
            for f in sorted(files):
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, out))
    print('built %-16s %6d bytes  (%s v%s)' % (t['wgt'], os.path.getsize(wgt), t['title'], t['version']))

if __name__ == '__main__':
    os.makedirs(DIST, exist_ok=True)
    for t in TARGETS:
        build(t)
