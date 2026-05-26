@echo off
echo Abriendo puerto 3000 en el firewall de Windows...
netsh advfirewall firewall add rule name="Turnos Hotel - Puerto 3000" dir=in action=allow protocol=TCP localport=3000
if %errorlevel% == 0 (
    echo.
    echo Puerto 3000 abierto correctamente.
) else (
    echo.
    echo Error al abrir el puerto. Asegurese de ejecutar como Administrador.
)
echo.
pause
