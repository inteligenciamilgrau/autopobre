"""Create smaller runtime MP3s, preserving original bytes outside the release."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from publicacao import ROOT, GAME, AUDIO_NAMES, contained_file

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--ffmpeg',default='ffmpeg')
    parser.add_argument('--ffprobe',default='ffprobe')
    args=parser.parse_args()
    backup=ROOT/'audios_originais';scratch=ROOT/'.audit-local/audio-compression'
    backup.mkdir(exist_ok=True);scratch.mkdir(parents=True,exist_ok=True)
    def probe(path):
        return json.loads(subprocess.check_output([args.ffprobe,'-v','error','-show_entries','format=duration,bit_rate,size','-of','json',str(path)]))['format']
    report=[]
    for name in AUDIO_NAMES:
        if not (ROOT/GAME/'assets/audio'/name).exists():continue
        source=contained_file(ROOT,GAME+'assets/audio/'+name);before=probe(source)
        if float(before.get('bit_rate',0))<=140000:continue
        digest=hashlib.sha256(source.read_bytes()).hexdigest();original=backup/name
        if original.exists() and hashlib.sha256(original.read_bytes()).hexdigest()!=digest:original=backup/(source.stem+'_'+digest[:10]+'.mp3')
        if not original.exists():shutil.copy2(source,original)
        output=scratch/name
        subprocess.run([args.ffmpeg,'-nostdin','-y','-v','error','-i',str(source),'-map','0:a:0','-vn','-c:a','libmp3lame','-b:a','128k','-ar','44100','-ac','2','-map_metadata','-1','-id3v2_version','0','-write_id3v1','0',str(output)],check=True)
        after=probe(output)
        if abs(float(before['duration'])-float(after['duration']))>.15:raise ValueError('Duration changed: '+name)
        if hashlib.sha256(source.read_bytes()).hexdigest()!=digest:raise ValueError('Source changed during encoding: '+name)
        if output.stat().st_size>=source.stat().st_size:continue
        source.write_bytes(output.read_bytes())
        report.append({'name':name,'before':int(before['size']),'after':int(after['size']),'duration':after['duration']})
    (scratch/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
