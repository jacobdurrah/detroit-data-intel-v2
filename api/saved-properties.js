const { handleCors, sendJson, sendError, intParam, requirePropertyWriteAuth } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    if (req.method === 'PUT') {
      if (!requirePropertyWriteAuth(req, res)) return;

      var id = intParam(req.query.id, null);
      if (!id) return sendError(res, 'id is required', 400);

      var body = req.body || {};
      var updates = {};
      var allowed = ['notes', 'status', 'offer_price', 'estimated_arv', 'estimated_rehab',
        'photos', 'rehab_plan', 'contractor_bids', 'report_data'];
      allowed.forEach(function (key) {
        if (body[key] !== undefined) updates[key] = body[key];
      });
      updates.updated_at = new Date().toISOString();

      var { data, error } = await supabase
        .from('saved_properties')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) {
        console.error('Update error:', error);
        return sendError(res, 'Failed to update saved property');
      }
      return sendJson(res, { data: data ? data[0] : null });
    }

    if (req.method === 'POST') {
      if (!requirePropertyWriteAuth(req, res)) return;

      var body = req.body || {};
      if (!body.address) return sendError(res, 'address is required', 400);

      var { data, error } = await supabase
        .from('saved_properties')
        .insert({
          search_id: body.search_id || null,
          address: body.address,
          parcel_id: body.parcel_id || null,
          neighborhood: body.neighborhood || null,
          zip: body.zip || null,
          list_price: body.list_price || null,
          offer_price: body.offer_price || null,
          estimated_arv: body.estimated_arv || null,
          estimated_rehab: body.estimated_rehab || null,
          notes: body.notes || null,
          status: body.status || 'researching',
          photos: body.photos || [],
        })
        .select();

      if (error) {
        console.error('Save error:', error);
        return sendError(res, 'Failed to save property');
      }

      // Update search result status to 'saved' if linked
      if (body.search_id) {
        await supabase
          .from('property_searches')
          .update({ status: 'saved' })
          .eq('id', body.search_id);
      }

      return sendJson(res, { data: data ? data[0] : null }, 201);
    }

    // GET
    var status = req.query.status || null;
    var page = intParam(req.query.page, 1);
    var limit = Math.min(intParam(req.query.limit, 20), 100);
    var offset = (page - 1) * limit;

    var query = supabase
      .from('saved_properties')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    var { data, error, count } = await query;

    if (error) {
      console.error('Query error:', error);
      return sendError(res, 'Failed to fetch saved properties');
    }

    sendJson(res, {
      data: data || [],
      meta: { total: count || 0, page: page, limit: limit },
    });
  } catch (err) {
    console.error('Error in /api/saved-properties:', err);
    sendError(res, 'Internal server error');
  }
};
