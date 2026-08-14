#!/usr/bin/env node

const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        // Skip APIPA/link-local addresses (169.254.x.x). Unconnected adapters
        // such as Bluetooth and idle VPN tunnels self-assign these, and they
        // are never reachable from a phone on the LAN.
        if (iface.address.startsWith('169.254.')) {
          continue;
        }
        // Skip virtual network interfaces
        if (!name.includes('docker') && !name.includes('vbox')) {
          return iface.address;
        }
      }
    }
  }

  return 'localhost';
}

const ip = getLocalIP();
console.log(ip);
