const strings = {
  'Climate': 'Clima', 'Water body properties': 'Características del lago', 'Water quality': 'Calidad del agua', 'Time and scenario': 'Tiempo', 'Display options': 'Visualización',
  'Solar radiation': 'Radiación solar', 'Air temperature': 'Temperatura del aire', 'Wind speed': 'Viento', 'Cloud cover': 'Nubosidad', 'Rain input': 'Lluvia',
  'Maximum depth': 'Profundidad', 'Surface area factor': 'Factor de superficie', 'Transparency': 'Transparencia', 'Initial stratification strength': 'Estratificación inicial', 'Water residence time': 'Tiempo de residencia',
  'Initial dissolved oxygen': 'Oxígeno disuelto inicial', 'Initial nutrient load': 'Nutrientes iniciales', 'Organic matter load': 'Materia orgánica', 'Turbidity': 'Turbidez', 'Conductivity baseline': 'Conductividad inicial', 'pH baseline': 'pH inicial',
  'Season': 'Estación', 'Spring': 'Primavera', 'Summer': 'Verano', 'Autumn': 'Otoño', 'Winter': 'Invierno', 'Duration': 'Duración', 'Time step mode': 'Paso de tiempo', 'Daily': 'Diario', 'Weekly': 'Semanal',
  'Show particles': 'Mostrar partículas', 'Show fish and algae icons': 'Mostrar peces y algas', 'Show labels': 'Mostrar etiquetas', 'Compare with baseline': 'Comparar con el escenario base', 'Primary color view': 'Variable del agua',
  'Temperature colors': 'Temperatura', 'Oxygen colors': 'Oxígeno', 'Nutrient colors': 'Nutrientes', 'Stability colors': 'Estabilidad', 'Export current state': 'Exportar estado (JSON)',
  'Summer stable stratification': 'Verano estable', 'Wind mixing event': 'Mezcla por viento', 'Eutrophic reservoir': 'Embalse eutrófico', 'Clear oligotrophic lake': 'Lago oligotrófico', 'Rainfall and turbidity pulse': 'Lluvia y turbidez', 'Autumn turnover': 'Mezcla otoñal',
  'Mixed': 'Mezclada', 'Strongly stratified': 'Fuerte', 'Weakly stratified': 'Débil', 'Critical': 'Crítico', 'Hypoxic': 'Hipoxia', 'Bloom risk': 'Riesgo de floración', 'Recovered': 'Recuperado', 'Stable': 'Estable',
  'A stable thermocline has formed': 'Termoclina estable', 'Warm surface water is now separated from colder deep water, limiting vertical exchange.': 'La diferencia de densidad limita la mezcla vertical.',
  'The water column is close to full mixing': 'Columna mezclada', 'Temperature differences are weak, so oxygen and nutrients can redistribute more easily.': 'Las diferencias térmicas son pequeñas: el oxígeno y los nutrientes se redistribuyen con mayor facilidad.',
  'Deep water oxygen is decreasing': 'El oxígeno profundo disminuye', 'Respiration and decomposition exceed oxygen supply in the poorly mixed hypolimnion.': 'La respiración y la descomposición consumen más oxígeno del que recibe el hipolimnio.',
  'Bottom layers have entered hypoxia': 'Hipoxia en el fondo', 'Fish and aerobic benthic organisms lose viable habitat as deep oxygen falls below ecological thresholds.': 'La escasez de oxígeno reduce el hábitat de los peces y los organismos bentónicos aerobios.',
  'Anoxia is developing near the sediments': 'Anoxia junto a los sedimentos', 'Oxygen is nearly absent, increasing stress and favoring strongly reducing sediment conditions.': 'El oxígeno casi se agota, aumentando el estrés y favoreciendo condiciones reductoras en el sedimento.',
  'Internal nutrient release is likely increasing': 'Liberación interna de nutrientes', 'Low oxygen at the sediment-water interface can mobilize phosphorus-like nutrients back into the water column.': 'El poco oxígeno junto al sedimento favorece la liberación de nutrientes hacia el agua.',
  'Algal bloom risk is high': 'Riesgo alto de floración', 'Warm illuminated surface layers plus available nutrients favor rapid algal growth and later oxygen demand.': 'El calor, la luz y los nutrientes favorecen el crecimiento de algas y su posterior demanda de oxígeno.',
  'Fish habitat is compressed': 'Hábitat de peces comprimido', 'Suitable temperature and oxygen overlap in a thinner vertical band, forcing organisms into a narrow refuge.': 'La temperatura y el oxígeno adecuados coinciden en una franja estrecha de refugio.',
  'Conditions remain within a moderate range': 'Condiciones moderadas', 'Profiles show no acute oxygen stress or bloom warning at the moment.': 'Los perfiles no indican estrés agudo por oxígeno ni alerta de floración.',
};
export function t(text) { return strings[text] || text; }
export function number(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits).replace('.', ',') : '—';
}
export const guides = {
  summer_stable: 'Observa cómo el calentamiento superficial y el viento débil mantienen la estratificación mientras la descomposición consume oxígeno profundo.',
  wind_mixing: 'Aumenta el viento y observa cómo la mezcla penetra hacia el fondo, enfría la superficie y modifica el oxígeno profundo.',
  eutrophic_reservoir: 'Compara el crecimiento de algas en superficie con el consumo posterior de oxígeno y la liberación interna de nutrientes.',
  oligotrophic_lake: 'Observa cómo la baja carga de nutrientes y materia orgánica reduce las algas y la demanda de oxígeno.',
  rainfall_pulse: 'Sigue los efectos de la lluvia y la turbidez: menos luz, enfriamiento superficial y entrada de nutrientes.',
  autumn_turnover: 'Observa cómo el enfriamiento y el viento reducen el contraste de densidad hasta aproximar la mezcla completa.',
};
