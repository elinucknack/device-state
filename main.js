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
    if (getBoardName().startsWith('Raspberry Pi')) {
        return Number(exec('vcgencmd measure_temp').stdout.split(/[=']/)[1].trim());
    }
    return null;
};

const getThrottled = () => {
    if (getBoardName().startsWith('Raspberry Pi')) {
        return Number(exec('vcgencmd get_throttled').stdout.split(/=/)[1].trim());
    }
    return null;
};

const getFreeHddSpace = () => {
    return checkDiskUsage('/').available;
};

const getFreeDataSpace = () => {
    if (fileExists('/mnt/data')) {
        return checkDiskUsage('/mnt/data').available;
    }
    return null;
};

const getFreeMemory = () => {
    return freemem();
};

const getTotalHddSpace = () => {
    return checkDiskUsage('/').total;
};

const getTotalDataSpace = () => {
    if (fileExists('/mnt/data')) {
        return checkDiskUsage('/mnt/data').total;
    }
    return null;
};

const getTotalMemory = () => {
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
    return Math.floor(Date.now() / 1000);
};

const createDeviceStateDriver = () => {
    return {
        getState: () => {
            return {
                architectureName: getArchitectureName(),
                boardName: getBoardName(),
                cpuCount: getCpuCount(),
                cpuFrequency: getCpuFrequency(),
                cpuLoad: getCpuLoad(),
                temperature: getTemperature(),
                throttled: getThrottled(),
                freeHddSpace: getFreeHddSpace(),
                freeDataSpace: getFreeDataSpace(),
                freeMemory: getFreeMemory(),
                totalHddSpace: getTotalHddSpace(),
                totalDataSpace: getTotalDataSpace(),
                totalMemory: getTotalMemory(),
                platform: getPlatform(),
                uptime: getUptime(),
                version: getVersion(),
                timestamp: getTimestamp()
            };
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
    
    const publish = (message, qos, retain) => {
        if (connection !== null) {
            connection.publish(
                `${process.env.APP_MQTT_TOPIC}/${hostname()}/state`,
                message || '{}',
                { qos: qos || 0, retain: retain || false },
                e => {
                    if (e) {
                        logger.error(e);
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
        publish: (message, qos, retain) => publish(message, qos, retain),
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

let connectionEvent = null;
let connectionState = 'unknown';
let connectionStateTimeoutId = null;

const setConnectionState = newConnectionState => {
    connectionState = newConnectionState;
    logger.info(`MQTT client ${newConnectionState}.`);
    mailer.send(`Device ${hostname()} notification`, `MQTT broker ${newConnectionState}.`);
    matrixDriver.send(`MQTT broker ${newConnectionState}.`);
};

mqttDriver.onConnect(() => {
    if (connectionEvent !== 'connect') {
        connectionEvent = 'connect';
        clearTimeout(connectionStateTimeoutId);
        if (['unknown', 'unconnected'].includes(connectionState)) {
            setConnectionState('connected');
        } else if (connectionState === 'disconnected') {
            setConnectionState('reconnected');
        }
        mqttDriver.publish(JSON.stringify(deviceStateDriver.getState(), null, '    '), 2, true);
    }
});

mqttDriver.onClose(() => {
    if (connectionEvent !== 'close') {
        connectionEvent = 'close';
        clearTimeout(connectionStateTimeoutId);
        connectionStateTimeoutId = setTimeout(() => {
            if (connectionState === 'unknown') {
                setConnectionState('unconnected');
            } else if (['connected', 'reconnected'].includes(connectionState)) {
                setConnectionState('disconnected');
            }
        }, 60000);
    }
});

logger.debug('Creating MQTT listeners completed.');

logger.debug('Creating device state repeater...');

setInterval(() => {
    mqttDriver.publish(JSON.stringify(deviceStateDriver.getState(), null, '    '), 2, true);
}, 15000);

logger.debug('Creating device state repeater completed.');

logger.info('=== DEVICE STATE INITIALIZATION COMPLETED ===');
