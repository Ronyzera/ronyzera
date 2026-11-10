// Ajustes do projeto android gerado pelo Capacitor, aplicados a cada build de APK:
//  1) permissões de microfone/câmera/áudio no AndroidManifest (voz e câmera do RONYZERA)
//  2) assinatura release com o keystore em android/app/keystore.jks
//  3) versionName (de apk-version.txt) e versionCode (número da build do Actions)
const fs = require('fs');
const path = require('path');

const A = p => path.join('android', 'app', 'src', 'main', p);
const GR = path.join('android', 'app', 'build.gradle');

// 1) AndroidManifest: permissões que o WebView precisa pra voz/câmera
const MAN = A('AndroidManifest.xml');
let man = fs.readFileSync(MAN, 'utf8');
const PERMS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.WAKE_LOCK',
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_CONNECT'
];
let added = 0;
for (const pr of PERMS) {
  if (!man.includes('">' + pr + '"')) {
    man = man.replace('<application', '<uses-permission android:name="' + pr + '"/>\n    <application');
    added++;
  }
}
fs.writeFileSync(MAN, man);
console.log('manifest: ' + added + ' permissões adicionadas');

// 2+3) build.gradle: assinatura release + versão
const ver = fs.readFileSync('apk-version.txt', 'utf8').trim();
const code = process.env.BUILD_NUMBER || Date.now();
let gr = fs.readFileSync(GR, 'utf8');
gr += `\n
// ---- RONYZERA (apk-patch.js) ----
android {
    defaultConfig {
        versionName ${JSON.stringify(ver)}
        versionCode ${Number(code)}
    }
    signingConfigs {
        release {
            storeFile file("keystore.jks")
            storePassword "ronyzera2026"
            keyAlias "ronyzera"
            keyPassword "ronyzera2026"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
    packagingOptions {
        resources {
            excludes += ['META-INF/DEPENDENCIES', 'META-INF/AL2.0', 'META-INF/LGPL2.1']
        }
    }
}`;
fs.writeFileSync(GR, gr);
console.log('gradle: versão ' + ver + ' (code ' + code + ') + assinatura ok');
