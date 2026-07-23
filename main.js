import { parse as parseCsv } from 'csv-parse/sync';
import { checkSync as checkDiskUsage } from 'diskusage';
import { existsSync as fileExists, readFileSync as readFile } from 'fs';
import { createClient as createMatrixClient } from 'matrix-js-sdk';
import { connect as connectMqtt } from 'mqtt';
import { createTransport as createMailerTransport } from 'nodemailer';
import { arch, cpus, freemem, hostname, loadavg, platform, release, totalmem, type, uptime } from 'os';
import path from 'path';
import exec from 'sync-exec';
import url from 'url';
import { createLogger, format as loggerFormat, transports as loggerTransports } from 'winston';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger({
    level: 'info',
    format: loggerFormat.combine(
        loggerFormat.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        loggerFormat.printf(message => {
            const getLevel = message => `${message.exception ? 'UNCAUGHT EXCEPTION' : message.level.toUpperCase()}`;
            const getMessage = message => `${message.stack ? message.stack : message.message}${message.cause ? '\nCaused by ' + getMessage(message.cause) : ''}`;
            return `${message.timestamp} | ${getLevel(message)} | ${getMessage(message)}`;
        })
    ),
    transports: [
        new loggerTransports.Console(),
        new loggerTransports.File({
            filename: `${__dirname}/app.log`,
            maxsize: 1000000
        })
    ],
    exceptionHandlers: [
        new loggerTransports.Console(),
        new loggerTransports.File({
            filename: `${__dirname}/app.log`,
            maxsize: 1000000
        })
    ]
});

logger.info('=== DEVICE STATE INITIALIZATION START ===');

logger.debug('Preparing device state driver definition...');

const getArchitectureName = () => {
    return arch();
};

const getBoardName = () => {
    if (platform() === 'linux') {
        return exec('cat /proc/cpuinfo | grep Model').stdout.split(':')[1].trim()
    }
    return null;
};

const getCpuCount = () => {
    return cpus().length;
};

const getCpuFrequency = () => {
    return Math.max(...cpus().map(cpu => cpu.speed));
};

const getCpuLoad = () => {
    return Number((100 * loadavg()[0] / getCpuCount()).toFixed(2));
};

const getTemperature = () => {
    if (getBoardName() && getBoardName().startsWith('Raspberry Pi')) {
        return Number(Number(exec('vcgencmd measure_temp').stdout.split(/[=']/)[1].trim()).toFixed(2));
    }
    return null;
};

const getThrottled = () => {
    if (getBoardName() && getBoardName().startsWith('Raspberry Pi')) {
        const throttled = Number(exec('vcgencmd get_throttled').stdout.split(/=/)[1].trim());
        return {
            underVoltageActive: (throttled & 0x1) !== 0,
            armFrequencyCappingActive: (throttled & 0x2) !== 0,
            throttlingActive: (throttled & 0x4) !== 0,
            softTemperatureLimitActive: (throttled & 0x8) !== 0,
            underVoltageHasOccurred: (throttled & 0x10000) !== 0,
            armFrequencyCappingHasOccurred: (throttled & 0x20000) !== 0,
            throttlingHasOccurred: (throttled & 0x40000) !== 0,
            softTemperatureLimitHasOccurred: (throttled & 0x80000) !== 0
        };
    }
    return null;
};

const getFreeOsDisk = () => {
    return checkDiskUsage('/').available;
};

const getUsedOsDisk = () => {
    const total = getTotalOsDisk();
    const free = getFreeOsDisk();
    return Number((100 * (total - free) / total).toFixed(2));
};

const getFreeDataDisk = () => {
    if (fileExists('/mnt/ext')) {
        return checkDiskUsage('/mnt/ext').available;
    }
    return null;
};

const getUsedDataDisk = () => {
    const total = getTotalDataDisk();
    const free = getFreeDataDisk();
    if (total !== null && free !== null) {
        return Number((100 * (total - free) / total).toFixed(2));
    }
    return null;
};

const getFreeRam = () => {
    return freemem();
};

const getUsedRam = () => {
    const total = getTotalRam();
    const free = getFreeRam();
    return Number((100 * (total - free) / total).toFixed(2));
};

const getTotalOsDisk = () => {
    return checkDiskUsage('/').total;
};

const getTotalDataDisk = () => {
    if (fileExists('/mnt/ext')) {
        return checkDiskUsage('/mnt/ext').total;
    }
    return null;
};

const getTotalRam = () => {
    return totalmem();
};

const getPlatform = () => {
    if (platform() === 'linux') {
        return parseCsv(readFile('/etc/os-release', 'utf8'), { delimiter: '=' }).find(item => item[0] === 'NAME')[1];
    }
    return type();
};

const getUptime = () => {
    return Math.floor(uptime());
};

const getVersion = () => {
    if (platform() === 'linux') {
        return parseCsv(readFile('/etc/os-release', 'utf8'), { delimiter: '=' }).find(item => item[0] === 'VERSION')[1];
    }
    return release();
};

const getTimestamp = () => {
    return Math.floor(Date.now() / 60000) * 60;
};

const createDeviceStateDriver = () => {
    return {
        getState: () => {
            let state = {
                platform: getPlatform(),
                architectureName: getArchitectureName(),
                version: getVersion(),
                cpuCount: getCpuCount(),
                cpuFrequency: getCpuFrequency(),
                cpuLoad: getCpuLoad(),
                cpuLoadThreshold: Number(process.env.APP_THRESHOLD_CPU_LOAD),
                totalOsDisk: getTotalOsDisk(),
                usedOsDisk: getUsedOsDisk(),
                usedOsDiskThreshold: Number(process.env.APP_THRESHOLD_USED_OS_DISK),
                totalRam: getTotalRam(),
                usedRam: getUsedRam(),
                usedRamThreshold: Number(process.env.APP_THRESHOLD_USED_RAM),
                uptime: getUptime(),
                timestamp: getTimestamp()
            };
            const boardName = getBoardName();
            if (boardName !== null) {
                state = {
                    ...state,
                    boardName
                };
            }
            const totalDataDisk = getTotalDataDisk();
            if (totalDataDisk !== null) {
                state = {
                    ...state,
                    totalDataDisk
                };
            }
            const usedDataDisk = getUsedDataDisk();
            if (usedDataDisk !== null) {
                state = {
                    ...state,
                    usedDataDisk,
                    usedDataDiskThreshold: Number(process.env.APP_THRESHOLD_USED_DATA_DISK)
                };
            }
            const temperature = getTemperature();
            if (temperature !== null) {
                state = {
                    ...state,
                    temperature,
                    temperatureThreshold: Number(process.env.APP_THRESHOLD_TEMPERATURE)
                };
            }
            const throttled = getThrottled();
            if (throttled !== null) {
                state = {
                    ...state,
                    ...throttled
                };
            }
            return state;
        }
    };
};

logger.debug('Preparing device state driver definition completed.');

logger.debug('Preparing MQTT driver definition...');

const createMqttDriver = () => {
    let connection = null;
    
    const connect = () => {
        let options = {
            protocol: process.env.APP_MQTT_PROTOCOL,
            host: process.env.APP_MQTT_HOST,
            port: process.env.APP_MQTT_PORT,
            username: process.env.APP_MQTT_USERNAME,
            password: Buffer.from(process.env.APP_MQTT_PASSWORD, 'base64').toString('utf8')
        };
        if (process.env.APP_MQTT_PROTOCOL === 'mqtts') {
            options = {
                ...options,
                ca: readFile(`${__dirname}/${process.env.APP_MQTT_CA_FILENAME}`),
                cert: readFile(`${__dirname}/${process.env.APP_MQTT_CERT_FILENAME}`),
                key: readFile(`${__dirname}/${process.env.APP_MQTT_KEY_FILENAME}`)
            };
        }
        connection = connectMqtt(options);
    };
    
    const publish = (topic, message, qos, retain, onSuccess, onError) => {
        if (connection !== null) {
            connection.publish(
                `${process.env.APP_MQTT_TOPIC}/${hostname()}/${topic}`,
                message || '{}',
                { qos: qos || 0, retain: retain || false },
                e => {
                    if (e) {
                        if (onError) {
                            onError();
                        }
                        logger.error(e);
                    } else if (onSuccess) {
                        onSuccess();
                    }
                }
            );
        } else {
            logger.debug('MQTT is disabled, no data sent.');
        }
    };
    
    const onConnect = callback => {
        if (connection !== null) {
            connection.on('connect', callback);
        }
    };
    
    const onClose = callback => {
        if (connection !== null) {
            connection.on('close', callback);
        }
    };
    
    const onError = callback => {
        if (connection !== null) {
            connection.on('error', callback);
        }
    };
    
    return {
        connect: () => connect(),
        publish: (topic, message, qos, retain) => publish(topic, message, qos, retain),
        onConnect: callback => onConnect(callback),
        onClose: callback => onClose(callback),
        onError: callback => onError(callback)
    };
};

logger.debug('Preparing MQTT driver definition completed.');

logger.debug('Creating MQTT driver...');

const mqttDriver = createMqttDriver();

logger.debug('Creating MQTT driver completed.');

logger.debug('Connecting MQTT server...');

mqttDriver.connect();

logger.debug('Connecting MQTT server completed.');

logger.debug('Preparing mailer definition...');

const createMailer = () => {
    let connection = null;
    
    const connect = () => {
        if (process.env.APP_MAILER_ENABLED === 'true') {
            let options = {
                host: process.env.APP_MAILER_HOST,
                port: process.env.APP_MAILER_PORT,
                secure: process.env.APP_MAILER_USE_SECURE_CONNECTION === 'true',
                auth: {
                    user: process.env.APP_MAILER_USERNAME,
                    pass: Buffer.from(process.env.APP_MAILER_PASSWORD, 'base64').toString('utf8'),
                }
            };
            connection = createMailerTransport(options);
        } else {
            logger.warn('Mailer is disabled.');
        }
    };
    
    const send = (subject, text) => {
        if (connection !== null) {
            connection.sendMail({
                from: process.env.APP_MAILER_SENDER,
                to: process.env.APP_MAILER_RECIPIENTS,
                subject: subject,
                text: text
            });
        } else {
            logger.debug('Mailer is disabled, no mail sent.');
        }
    };
    
    return {
        connect: () => connect(),
        send: (subject, text) => send(subject, text)
    };
};

logger.debug('Preparing mail driver definition completed.');

logger.debug('Creating mailer...');

const mailer = createMailer();

logger.debug('Creating mailer completed.');

logger.debug('Connecting mailer...');

mailer.connect();

logger.debug('Connecting mailer completed.');

logger.debug('Preparing Matrix driver definition...');

const createMatrixDriver = () => {
    let connection = null;
    
    const connect = () => {
        if (process.env.APP_MATRIX_ENABLED === 'true') {
            let options = {
                baseUrl: process.env.APP_MATRIX_BASE_URL,
                userId: process.env.APP_MATRIX_USER_ID,
                deviceId: process.env.APP_MATRIX_DEVICE_ID,
                accessToken: Buffer.from(process.env.APP_MATRIX_ACCESS_TOKEN, 'base64').toString('utf8')
            };
            connection = createMatrixClient(options);
        } else {
            logger.warn('Matrix is disabled.');
        }
    };
    
    const send = text => {
        if (connection !== null) {
            connection.sendEvent(process.env.APP_MATRIX_ROOM_ID, 'm.room.message', {
                body: text,
                msgtype: 'm.notice'
            }, '', (err, res) => {
                if (err) {
                    logger.error(err);
                    setTimeout(() => {
                        send(text);
                    }, 15000);
                }
            });
        } else {
            logger.debug('Matrix is disabled, no message sent.');
        }
    };
    
    return {
        connect: () => connect(),
        send: text => send(text)
    };
};

logger.debug('Preparing Matrix driver definition completed.');

logger.debug('Creating Matrix driver...');

const matrixDriver = createMatrixDriver();

logger.debug('Creating Matrix driver completed.');

logger.debug('Connecting Matrix server...');

matrixDriver.connect();

logger.debug('Connecting Matrix server completed.');

logger.debug('Creating device state driver...');

const deviceStateDriver = createDeviceStateDriver();

logger.debug('Creating device state driver completed.');

logger.debug('Creating MQTT listeners...');

let lastSentTimestamp = null;

function capitalizeFirstLetter(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const sendNotification = (subject, body) => {
    logger.info(body);
    mailer.send(subject, body);
    matrixDriver.send(body);
};

mqttDriver.onConnect(() => {
    const deviceName = capitalizeFirstLetter(hostname());
    const subject = `${deviceName} notification.`;
    const body = `${deviceName} connected to MQTT broker.`;
    sendNotification(subject, body);
});

mqttDriver.onClose(() => {
    const deviceName = capitalizeFirstLetter(hostname());
    const subject = `${deviceName} notification.`;
    const body = `${deviceName} disconnected from MQTT broker.`;
    sendNotification(subject, body);
    lastSentTimestamp = null;
});

logger.debug('Creating MQTT listeners completed.');

logger.debug('Creating device state repeater...');

setInterval(() => {
    let deviceState = deviceStateDriver.getState();
    if (deviceState.timestamp !== lastSentTimestamp) {
        mqttDriver.publish('state', JSON.stringify(deviceStateDriver.getState(), null, '    '), 1, true, () => {
            lastSentTimestamp = deviceState.timestamp;
        }, () => {
            lastSentTimestamp = null;
            logger.info('Sending device state failed');
        });
    }
}, 15000);

logger.debug('Creating device state repeater completed.');

logger.info('=== DEVICE STATE INITIALIZATION COMPLETED ===');
