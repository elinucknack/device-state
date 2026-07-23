# Device state

This is the documentation of Device state, an application monitoring device state and sending it to an MQTT broker!

The following steps describe the installation of Device state on Debian.

## Install the prerequisite software

### Install Node.js (for ARMv6)

1. Connect to the device through SSH.
2. Switch to `root` through `sudo su`.
3. Install Node.js and npm:

```bash
wget https://unofficial-builds.nodejs.org/download/release/v21.7.3/node-v21.7.3-linux-armv6l.tar.gz
tar -xzf node-v21.7.3-linux-armv6l.tar.gz
cd node-v21.7.3-linux-armv6l
sudo cp -R * /usr/local/
```

### Install Node.js (for ARMv7)

1. Connect to the device through SSH.
2. Switch to `root` through `sudo su`.
3. Install Node.js and npm:

```bash
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

```bash
adduser device-state
```

4. Add user `device-state` to group `video`:

```bash
usermod -a -G video device-state
```

### Prepare the file system

1. Create the `/var/device-state` directory:

```bash
mkdir /var/device-state
chown device-state:device-state /var/device-state
```

2. Copy the content of this folder to the directory `/var/device-state`.

### Customize `device-state.service`

1. For ARMv6, change `ExecStart` to `/usr/local/bin/node /var/device-state/main.js`.
2. Configure the required environment variables:

```ini
# MQTT Configuration
APP_MQTT_PROTOCOL=mqtt
APP_MQTT_HOST=localhost
APP_MQTT_PORT=1883
APP_MQTT_USERNAME=my_user
APP_MQTT_PASSWORD=my_password_encoded_in_base64
APP_MQTT_TOPIC=device-topic

# Mailer Configuration
APP_MAILER_ENABLED=false
APP_MAILER_HOST=smtp.example.com
APP_MAILER_PORT=587
APP_MAILER_USE_SECURE_CONNECTION=false
APP_MAILER_USERNAME=smtp_user
APP_MAILER_PASSWORD=smtp_password_encoded_in_base64
APP_MAILER_SENDER=sender@example.com
APP_MAILER_RECIPIENTS=recipient@example.com

# Matrix Configuration
APP_MATRIX_ENABLED=false
APP_MATRIX_BASE_URL=https://matrix.org
APP_MATRIX_USER_ID=@user:matrix.org
APP_MATRIX_DEVICE_ID=MY_DEVICE_ID
APP_MATRIX_ACCESS_TOKEN=matrix_token_encoded_in_base64
APP_MATRIX_ROOM_ID=!roomid:matrix.org

# Threshold Configuration (Optional/Recommended)
APP_THRESHOLD_CPU_LOAD=80
APP_THRESHOLD_USED_OS_DISK=90
APP_THRESHOLD_USED_DATA_DISK=90
APP_THRESHOLD_USED_RAM=85
APP_THRESHOLD_TEMPERATURE=75
```

3. Depending on the configuration of your MQTT broker, set `APP_MQTT_PROTOCOL` to `mqtts`. In case of `mqtts`, place the certificate files into the directory `/var/device-state` and set their filenames:

```ini
APP_MQTT_CA_FILENAME=rootCA.crt
APP_MQTT_CERT_FILENAME=mysite.crt
APP_MQTT_KEY_FILENAME=mysite.key
```

4. Set the environment variable `APP_MAILER_ENABLED` to `true` to enable email notifications.
5. Set the mailer password encoded in base64 via `APP_MAILER_PASSWORD`.
6. Set the environment variable `APP_MATRIX_ENABLED` to `true` to enable notification sending using the matrix protocol.
7. Set the matrix access token encoded in base64 via `APP_MATRIX_ACCESS_TOKEN`.

### Install NPM modules and start the app

1. Install npm modules:

```bash
su - device-state
cd /var/device-state
npm install
exit
```

2. Enable and start the `device-state` service:

```bash
systemctl enable /var/device-state/device-state.service
systemctl start device-state
```

## Usage

Upon starting, the application checks device state periodically every **15 seconds**.

When a new minute threshold is crossed, the application publishes the full state payload to the MQTT topic structured as `${APP_MQTT_TOPIC}/${hostname}/state`.

All payloads are sent with:
* `QoS`: **1**
* `Retain`: **true**

Additionally, notification messages (such as connecting or disconnecting from the MQTT broker) are sent via Email and Matrix if enabled.

### Device State Payload Schema

The published payload contains unified system state information and configured threshold values:

* `platform` (String)
* `architectureName` (String)
* `boardName` (String or missing if not detected)
* `version` (String)
* `cpuCount` (Integer)
* `cpuFrequency` (Integer, max CPU speed in MHz)
* `cpuLoad` (Float, normalized CPU load percentage)
* `cpuLoadThreshold` (Float, value from `APP_THRESHOLD_CPU_LOAD`)
* `totalOsDisk` (Integer, total bytes of `/`)
* `usedOsDisk` (Float, percentage of used disk space on `/`)
* `usedOsDiskThreshold` (Float, value from `APP_THRESHOLD_USED_OS_DISK`)
* `totalDataDisk` (Integer or missing if `/mnt/ext` does not exist)
* `usedDataDisk` (Float or missing, percentage of used disk space on `/mnt/ext`)
* `usedDataDiskThreshold` (Float or missing, value from `APP_THRESHOLD_USED_DATA_DISK`)
* `totalRam` (Integer, total system memory in bytes)
* `usedRam` (Float, percentage of used system memory)
* `usedRamThreshold` (Float, value from `APP_THRESHOLD_USED_RAM`)
* `temperature` (Float or missing if not on Raspberry Pi)
* `temperatureThreshold` (Float or missing, value from `APP_THRESHOLD_TEMPERATURE`)
* `underVoltageActive` (Boolean or missing if not on Raspberry Pi)
* `armFrequencyCappingActive` (Boolean or missing if not on Raspberry Pi)
* `throttlingActive` (Boolean or missing if not on Raspberry Pi)
* `softTemperatureLimitActive` (Boolean or missing if not on Raspberry Pi)
* `underVoltageHasOccurred` (Boolean or missing if not on Raspberry Pi)
* `armFrequencyCappingHasOccurred` (Boolean or missing if not on Raspberry Pi)
* `throttlingHasOccurred` (Boolean or missing if not on Raspberry Pi)
* `softTemperatureLimitHasOccurred` (Boolean or missing if not on Raspberry Pi)
* `uptime` (Integer, system uptime in seconds)
* `timestamp` (Unix epoch timestamp in seconds, rounded down to current minute)

## Authors

* **[Eliessa](mailto:eliessa@post.cz)**
