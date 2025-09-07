# Device state

This is the documentation of Device state, an application monitoring device state and sending it to Node-RED!

The following steps describe the installation of Device state on Debian.

## Install the prerequisite software

### Install Node.js (for ARMv6)

1. Connect to the device through SSH.
2. Switch to `root` through `sudo su`.
3. Install Node.js and npm:
```
wget https://unofficial-builds.nodejs.org/download/release/v21.7.3/node-v21.7.3-linux-armv6l.tar.gz
tar -xzf node-v21.7.3-linux-armv6l.tar.gz
cd node-v21.7.3-linux-armv6l
sudo cp -R * /usr/local/
```

### Install Node.js (for ARMv7)

1. Connect to the device through SSH.
2. Switch to `root` through `sudo su`.
3. Install Node.js and npm:
```
curl -sL https://deb.nodesource.com/setup_21.x | sudo bash -
apt update
apt upgrade
apt install nodejs
```

## Install the app

### Prepare the UNIX user

1. Connect to the device through SSH.
2. Switch to `root` through `sudo su`.
3. Create the new user `device-state`:
```
adduser device-state
```
4. Add user `device-state` to group `video`:
```
usermod -a -G video device-state
```

### Prepare the file system

1. Create the `/var/device-state` directory:
```
mkdir /var/device-state
chown device-state:device-state /var/device-state
```
2. Copy the content of this folder to the directory `/var/device-state`.

### Customize `device-state.service`

1. For ARMv6, change `ExecStart` to `/usr/local/bin/node /var/device-state/main.js`.
2. Set the environment variable `APP_MQTT_ENABLED` to `true` to enable the communication with an MQTT broker.
3. Depending on the configuration of MQTT broker, set `APP_MQTT_PROTOCOL` to `mqtt` or `mqtts`. In case of `mqtts`, it's necessary to put the certificate files into the directory `/var/device-state` and don't forget to set their filenames into `device-state.service`:
```
APP_MQTT_CA_FILENAME=rootCA.crt
APP_MQTT_CERT_FILENAME=mysite.crt
APP_MQTT_KEY_FILENAME=mysite.key
```
4. Set the MQTT broker password encoded in base64.
5. Set the environment variable `APP_MAILER_ENABLED` to `true` to enable the notification sending to email.
6. Set the mailer password encoded in base64.
7. Set the environment variable `APP_MATRIX_ENABLED` to `true` to enable the notification sending using the matrix protocol.
8. Set the matrix access token encoded in base64.

### Install NPM modules and start the app

1. Install npm modules:
```
su - device-state
cd /var/device-state
npm install
exit
```
2. Enable and start the `device-state` service:
```
systemctl enable /var/device-state/device-state.service
systemctl start device-state
```

## Usage

After the connection to the MQTT server, the device state is sent every 15 seconds using the `device-topic/state` topic, the `retain` flag is set to `true` and the `QoS` flag is set to `2`.

The device state contains the following data:
- `architectureName`
- `boardName`
- `coreVersion`
- `cpuCount`
- `cpuLoad` (in %)
- `temperature` (in &deg;C)
- `throttled` (integer)
- `freeHddSpace` (in %)
- `freeDataSpace` (in %)
- `freeMemory` (in %)
- `totalHddSpace` (in bytes)
- `totalDataSpace` (in bytes)
- `totalMemory` (in bytes)
- `platform`
- `uptime` (using the format `(W'w')(D'd')HH:MI:SS`)
- `version`
- `timestamp` (Unix time in seconds)

## Authors

- [**Eli Nucknack**](mailto:eli.nucknack@gmail.com)

