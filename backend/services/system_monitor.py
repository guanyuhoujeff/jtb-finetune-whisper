
import psutil
import platform
import threading
import time

try:
    import GPUtil
    GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False

class SystemMonitor:
    def get_stats(self):
        # CPU
        cpu_percent = psutil.cpu_percent(interval=None)
        cpu_freq = psutil.cpu_freq()
        cpu_info = f"{platform.processor()}"

        # RAM
        ram = psutil.virtual_memory()
        
        # GPU
        gpus = []
        if GPU_AVAILABLE:
            try:
                gpus_found = GPUtil.getGPUs()
                for gpu in gpus_found:
                    gpus.append({
                        "id": gpu.id,
                        "name": gpu.name,
                        "load": gpu.load * 100,
                        "memory_total": gpu.memoryTotal,
                        "memory_used": gpu.memoryUsed,
                        "memory_util": gpu.memoryUtil * 100,
                        "temperature": gpu.temperature
                    })
            except:
                pass # Fail silently if GPU access issues

        return {
            "cpu": {
                "model": cpu_info,
                "usage_percent": cpu_percent,
                "cores": psutil.cpu_count(logical=False),
                "threads": psutil.cpu_count(logical=True),
            },
            "ram": {
                "total_gb": round(ram.total / (1024**3), 2),
                "used_gb": round(ram.used / (1024**3), 2),
                "available_gb": round(ram.available / (1024**3), 2),
                "usage_percent": ram.percent
            },
            "gpus": gpus
        }

system_monitor = SystemMonitor()
