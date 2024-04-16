import('/pages/src/fields.mjs').then(module => {
    module.fieldGroupNames['segments'] = 'Segments';       
    module.fields.push({
            group: 'Segments',
            id: 'el-segment-next',
            value: x => x.segmentData.nextSegment.name ? (x.segmentData.nextSegment.displayName ?? x.segmentData.nextSegment.name) + ": " + x.segmentData.nextSegment.distanceToGo : '',
            key: x => (x && x.athlete) ? '' : 'Next Segment',
            unit: x => x.segmentData.nextSegment.distanceToGoUnits ? x.segmentData.nextSegment.distanceToGoUnits : ''
    })
});