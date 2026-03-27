#!/bin/bash

if systemctl is-active --quiet bluetooth; then
    sudo systemctl stop bluetooth
else
    sudo systemctl start bluetooth
fi
