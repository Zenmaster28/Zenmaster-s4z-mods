import('/pages/src/fields.mjs').then(module => {
    module.fieldGroupNames['segments'] = 'Segments';       
    module.fields.push({
            group: 'Segments',
            id: 'el-segment-next',
            format: x => x.segmentData.nextSegment.name ? (x.segmentData.nextSegment.displayName ?? x.segmentData.nextSegment.name) + ": " + x.segmentData.nextSegment.distanceToGo : '',
            shortName: x => (x && x.athlete) ? '' : 'Next Segment',
            suffix: x => x.segmentData.nextSegment.distanceToGoUnits ? x.segmentData.nextSegment.distanceToGoUnits : ''
    })
});